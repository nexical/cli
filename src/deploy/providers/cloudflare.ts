import path from 'node:path';
import { logger } from '@nexical/cli-core';
import { HostingProvider, DeploymentContext, CIConfig, AppConfig } from '../types';
import { execAsync } from '../utils';

export interface CloudflareConfig {
  token?: string;
  account?: string;
}

export class CloudflareProvider implements HostingProvider {
  name = 'cloudflare';

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
      };
      logger.info(`Ensuring Cloudflare Pages project "${projectName}" exists...`);
      try {
        await execAsync(`wrangler pages project create ${projectName} --production-branch main`, {
          env: processEnv,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('already exists')) {
          logger.info('Cloudflare project already exists.');
        } else {
          throw err;
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
    };

    await execAsync(`wrangler pages deploy ${artifactPath} --project-name=${projectName}`, {
      cwd: targetDir,
      env: processEnv,
    });

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
