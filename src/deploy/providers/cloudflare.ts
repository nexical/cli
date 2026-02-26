import path from 'node:path';
import fs from 'node:fs';
import { logger } from '@nexical/cli-core';
import { HostingProvider, DeploymentContext, CIConfig, AppConfig, DeploymentError } from '../types';
import { spawnAsync } from '../utils';

export interface CloudflareConfig {
  token?: string;
  account?: string;
}

export class CloudflareProvider implements HostingProvider {
  name = 'cloudflare';

  private async runWrangler(
    context: DeploymentContext,
    app: AppConfig,
    args: string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; commandName: string },
    retries = 5,
  ): Promise<void> {
    const debug = !!context.options.debug;
    const logsDir = path.resolve(context.cwd, 'logs');

    if (!debug) {
      await fs.promises.mkdir(logsDir, { recursive: true });
    }

    const logFile = path.resolve(logsDir, `cloudflare-${app.name}-${options.commandName}.log`);

    if (!debug) {
      logger.info(`Log file: ${logFile}`);
    }

    let attempt = 0;
    while (attempt <= retries) {
      try {
        await spawnAsync('wrangler', args, {
          cwd: options.cwd || context.cwd,
          env: options.env,
          debug,
          logFile,
        });
        return;
      } catch (err: unknown) {
        attempt++;
        const error = err as DeploymentError;
        const message = error.message || String(err);
        const output = error.output || '';

        // Strip ANSI escape codes for cleaner regex matching
        // eslint-disable-next-line no-control-regex
        const stripAnsi = (str: string) => str.replace(/\u001b\[[0-9;]*[mK]/g, '');
        const cleanMessage = stripAnsi(message);
        const cleanOutput = stripAnsi(output);
        const combined = `${cleanMessage}\n${cleanOutput}`;

        // Expanded transient regex to catch more variations of connection/API errors
        const transientRegex =
          /503|502|504|connection termination|upstream connect error|reset by|malformed response|Service Unavailable|Internal Server Error|ECONNRESET|ETIMEDOUT/i;
        const isTransient = transientRegex.test(combined);

        if (debug) {
          logger.info(`Command failed on attempt ${attempt}. Checking for transient error...`);
          logger.info(`Transient match: ${isTransient}`);
          if (!isTransient) {
            logger.debug(`Full failed output context (cleaned):\n${combined}`);
          }
        }

        if (isTransient && attempt <= retries) {
          const delay = Math.min(Math.pow(2, attempt) * 2000, 30000); // Max 30s delay
          logger.warn(
            `Cloudflare API returned transient error (Attempt ${attempt}/${retries}). Retrying in ${delay / 1000}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  }

  async provision(context: DeploymentContext, app: AppConfig): Promise<void> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = app.projectName;

    if (!baseProjectName) {
      throw new Error(
        `Cloudflare project name not found for ${app.name}. Please configure 'projectName'.`,
      );
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;

    logger.info(`Configuring Cloudflare Pages for ${app.name}...`);

    if (context.options.dryRun) {
      logger.info(
        `[Dry Run] Would check Cloudflare status and provision project "${projectName}".`,
      );
      return;
    }

    try {
      const secrets = await this.getSecrets(context, app).catch(() => undefined);
      if (!secrets) {
        logger.warn(
          `Cloudflare credentials missing for ${app.name}. Skipping provisioning. ` +
            'Ensure CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are set.',
        );
        return;
      }

      const processEnv = {
        ...process.env,
        ...secrets,
        NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --dns-result-order=ipv4first`.trim(),
      };
      const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;
      const apiToken = secrets.CLOUDFLARE_API_TOKEN;
      const accountId = secrets.CLOUDFLARE_ACCOUNT_ID;

      logger.info(`Ensuring Cloudflare Pages project "${projectName}" exists...`);

      // Check if project exists via API first to avoid unnecessary creation attempts
      const projectRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`,
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (projectRes.ok) {
        logger.info(`Cloudflare project "${projectName}" already exists.`);
      } else {
        try {
          await this.runWrangler(
            context,
            app,
            ['pages', 'project', 'create', projectName, '--production-branch', 'main'],
            {
              env: processEnv,
              commandName: 'provision',
            },
          );
        } catch (err: unknown) {
          const error = err as DeploymentError;
          const message = error.message || String(err);
          const output = error.output || '';
          const combined = `${message}\n${output}`.toLowerCase();

          if (combined.includes('already exists') || combined.includes('already_exists')) {
            logger.info('Cloudflare project already exists (detected after creation attempt).');
          } else {
            throw err;
          }
        }
      }

      // Handle Linked Domains
      if (app.domain) {
        const domains = Array.isArray(app.domain) ? app.domain : [app.domain];
        logger.info(
          `Linking ${domains.length} domains to Cloudflare Pages project "${projectName}"...`,
        );

        const apiToken = secrets.CLOUDFLARE_API_TOKEN;
        const accountId = secrets.CLOUDFLARE_ACCOUNT_ID;

        // Fetch existing domains to avoid redundant calls
        const listRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
          },
        );

        if (!listRes.ok) {
          const errorText = await listRes.text();
          logger.warn(`Failed to fetch existing linked domains: ${errorText}`);
        } else {
          const listJson = (await listRes.json()) as {
            success: boolean;
            result: { name: string }[];
          };
          const existingDomains = listJson.success ? listJson.result.map((d) => d.name) : [];

          for (const domain of domains) {
            if (existingDomains.includes(domain)) {
              logger.info(`[Cloudflare Pages] Domain ${domain} is already linked.`);
              continue;
            }

            logger.info(`[Cloudflare Pages] Linking domain ${domain}...`);
            const linkRes = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/domains`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name: domain }), // Pages API uses 'name' for the domain string in some versions, but docs suggest 'name' or just object. Let's verify 'name' vs 'domain'.
                // Correction: The API docs say POST body should be { "name": "example.com" }
              },
            );

            if (!linkRes.ok) {
              const errorText = await linkRes.text();
              // If it failed because it exists but wasn't in list (unlikely but safe)
              if (
                errorText.includes('already exists') ||
                errorText.includes('already added') ||
                errorText.includes('1008') ||
                errorText.includes('8000018')
              ) {
                logger.info(`[Cloudflare Pages] Domain ${domain} already linked.`);
              } else {
                logger.warn(`[Cloudflare Pages] Failed to link domain ${domain}: ${errorText}`);
              }
            } else {
              logger.success(`[Cloudflare Pages] Linked domain ${domain}.`);
            }
          }
        }
      }
    } catch (e: unknown) {
      logger.warn('Cloudflare setup failed.');
      throw e;
    }
  }

  async getSecrets(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>> {
    const cfConfig = (app.cloudflare as CloudflareConfig) || {};
    const apiTokenEnvVar = cfConfig.token;
    const accountIdEnvVar = cfConfig.account;

    const apiToken =
      process.env.CLOUDFLARE_API_TOKEN?.trim() ||
      (apiTokenEnvVar ? process.env[apiTokenEnvVar]?.trim() : undefined);
    const accountId =
      process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ||
      (accountIdEnvVar ? process.env[accountIdEnvVar]?.trim() : undefined);

    if (!apiToken) {
      throw new Error(
        `Cloudflare API Token not found for ${app.name}. Please provide it via:\n` +
          `1. Setting CLOUDFLARE_API_TOKEN in .env (Recommended)\n` +
          `2. Configuring 'cloudflare.token' and setting that env var in .env`,
      );
    }

    if (!accountId) {
      throw new Error(
        `Cloudflare Account ID not found for ${app.name}. Please provide it via:\n` +
          `1. Setting CLOUDFLARE_ACCOUNT_ID in .env (Recommended)\n` +
          `2. Configuring 'cloudflare.account' and setting that env var in .env`,
      );
    }

    const secrets: Record<string, string> = {
      CLOUDFLARE_API_TOKEN: apiToken,
      CLOUDFLARE_ACCOUNT_ID: accountId,
    };

    // Custom mapped secrets
    if (app.secrets) {
      for (const [key, envVar] of Object.entries(app.secrets)) {
        const value = process.env[envVar];
        if (!value) {
          throw new Error(`Custom secret '${key}' mapping failed: Env var '${envVar}' not found.`);
        }
        secrets[key] = value;
      }
    }

    return secrets;
  }

  async getVariables(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = app.projectName;

    if (!baseProjectName) {
      throw new Error(`Cloudflare project name not found for ${app.name}.`);
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;
    const varName = `CLOUDFLARE_PROJECT_NAME_${app.name.toUpperCase().replace(/-/g, '_')}`;
    const result: Record<string, string> = {
      [varName]: projectName,
    };

    // Custom mapped variables
    if (app.env) {
      for (const [key, value] of Object.entries(app.env)) {
        // If it looks like an env var, try to resolve it, otherwise use literal
        const resolvedValue = process.env[value] || value;
        result[key] = resolvedValue;
      }
    }

    return result;
  }

  getCIConfig(repoType: 'github' | 'gitlab', app: AppConfig): CIConfig {
    const varName = `CLOUDFLARE_PROJECT_NAME_${app.name.toUpperCase().replace(/-/g, '_')}`;
    const artifactPath = app.artifactPath || 'dist';
    return {
      secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      variables: [varName],
      deploySteps: [], // Handled by action
      githubActionStep: {
        name: `Deploy ${app.name} to Cloudflare Pages`,
        uses: 'cloudflare/wrangler-action@v3',
        with: {
          apiToken: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
          accountId: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
          command: `pages deploy ${artifactPath} --project-name=\${{ vars.${varName} }}`,
          workingDirectory: app.target || '.',
        },
      },
    };
  }

  async deploy(context: DeploymentContext, app: AppConfig): Promise<void> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = app.projectName;
    const artifactPath = app.artifactPath || 'dist';
    const targetDir = app.target ? path.resolve(context.cwd, app.target) : context.cwd;

    if (!baseProjectName) {
      throw new Error(`Cloudflare project name not found for ${app.name}.`);
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;

    logger.info(`Deploying ${app.name} to Cloudflare Pages project "${projectName}"...`);

    if (context.options.dryRun) {
      logger.info(
        `[Dry Run] Would deploy directory "${artifactPath}" to Cloudflare project "${projectName}".`,
      );
      return;
    }

    const secrets = await this.getSecrets(context, app);
    const processEnv = {
      ...process.env,
      ...secrets,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --dns-result-order=ipv4first`.trim(),
    };

    await this.runWrangler(
      context,
      app,
      ['pages', 'deploy', artifactPath, `--project-name=${projectName}`],
      {
        cwd: targetDir,
        env: processEnv,
        commandName: 'deploy',
      },
    );

    logger.success(`Successfully deployed ${app.name} to Cloudflare Pages.`);
  }

  getDefaultDnsTarget(app: AppConfig): string | undefined {
    // Cloudflare pages gives a predictable .pages.dev alias
    // Note: This does not take environment into account for custom domains usually,
    // custom domains are typically linked to the production project alias or a specific branch alias.
    // For standard custom domain linkage, we return the production project alias.
    if (app.projectName) {
      return `${app.projectName}.pages.dev`;
    }
    return undefined;
  }
}
