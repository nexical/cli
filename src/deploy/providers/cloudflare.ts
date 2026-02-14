import { logger } from '@nexical/cli-core';
import { DeploymentProvider, DeploymentContext, CIConfig } from '../types';
import { execAsync } from '../utils';

export class CloudflareProvider implements DeploymentProvider {
  name = 'cloudflare';
  type = 'frontend' as const;

  async provision(context: DeploymentContext): Promise<void> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = context.config.deploy?.frontend?.projectName;

    if (!baseProjectName) {
      throw new Error(
        "Cloudflare project name not found in nexical.yaml. Please configure 'deploy.frontend.projectName'.",
      );
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;

    const options = context.config.deploy?.frontend?.options || {};

    // Resolve credentials:
    // 1. CLI flag (options)
    // 2. Env var defined in config (options.apiTokenEnvVar)
    // 3. Default env var (CLOUDFLARE_API_TOKEN)
    const apiTokenEnvVar =
      typeof options.apiTokenEnvVar === 'string' ? options.apiTokenEnvVar : undefined;
    const apiToken =
      (typeof context.options.cloudflareToken === 'string'
        ? context.options.cloudflareToken
        : undefined) ||
      (apiTokenEnvVar ? process.env[apiTokenEnvVar] : undefined) ||
      process.env.CLOUDFLARE_API_TOKEN;

    const accountIdEnvVar =
      typeof options.accountIdEnvVar === 'string' ? options.accountIdEnvVar : undefined;
    const accountId =
      (typeof context.options.cloudflareAccount === 'string'
        ? context.options.cloudflareAccount
        : undefined) ||
      (accountIdEnvVar ? process.env[accountIdEnvVar] : undefined) ||
      process.env.CLOUDFLARE_ACCOUNT_ID;

    logger.info('Configuring Cloudflare Pages...');

    if (context.options.dryRun) {
      logger.info(
        `[Dry Run] Would check Cloudflare Pages project "${projectName}" and create if missing.`,
      );
      return;
    }

    if (!apiToken || !accountId) {
      logger.warn('Cloudflare credentials missing. Skipping automated Cloudflare setup.');
      logger.info('You can manually set up Cloudflare Pages and add the secrets to GitHub.');
      return;
    }

    try {
      logger.info(`Ensuring Cloudflare Pages project "${projectName}" exists...`);
      try {
        await execAsync(`wrangler pages project create ${projectName} --production-branch main`, {
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: apiToken,
            CLOUDFLARE_ACCOUNT_ID: accountId,
          },
        });
      } catch {
        logger.info('Cloudflare project might already exist.');
      }
    } catch (e: unknown) {
      logger.warn('Cloudflare setup failed.');
      throw e;
    }
  }

  async getSecrets(context: DeploymentContext): Promise<Record<string, string>> {
    const options = context.config.deploy?.frontend?.options || {};
    const secrets: Record<string, string> = {};

    // Resolve API Token
    const apiTokenEnvVar =
      typeof options.apiTokenEnvVar === 'string' ? options.apiTokenEnvVar : undefined;
    const apiToken =
      (apiTokenEnvVar ? process.env[apiTokenEnvVar] : undefined) ||
      process.env.CLOUDFLARE_API_TOKEN;

    if (!apiToken) {
      throw new Error(
        `Cloudflare API Token not found. Please provide it via:\n` +
          `1. Configuring 'deploy.frontend.options.apiTokenEnvVar' in nexical.yaml and setting that env var in .env\n` +
          `2. Setting CLOUDFLARE_API_TOKEN in .env`,
      );
    }
    secrets['CLOUDFLARE_API_TOKEN'] = apiToken;

    // Resolve Account ID
    const accountIdEnvVar =
      typeof options.accountIdEnvVar === 'string' ? options.accountIdEnvVar : undefined;
    const accountId =
      (accountIdEnvVar ? process.env[accountIdEnvVar] : undefined) ||
      process.env.CLOUDFLARE_ACCOUNT_ID;

    if (!accountId) {
      throw new Error(
        `Cloudflare Account ID not found. Please provide it via:\n` +
          `1. Configuring 'deploy.frontend.options.accountIdEnvVar' in nexical.yaml and setting that env var in .env\n` +
          `2. Setting CLOUDFLARE_ACCOUNT_ID in .env`,
      );
    }
    secrets['CLOUDFLARE_ACCOUNT_ID'] = accountId;

    return secrets;
  }

  async getVariables(context: DeploymentContext): Promise<Record<string, string>> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = context.config.deploy?.frontend?.projectName;

    if (!baseProjectName) {
      throw new Error(
        "Cloudflare project name not found in nexical.yaml. Please configure 'deploy.frontend.projectName'.",
      );
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;
    return {
      CLOUDFLARE_PROJECT_NAME: projectName,
    };
  }

  getCIConfig(): CIConfig {
    return {
      secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'],
      variables: ['CLOUDFLARE_PROJECT_NAME'],
      deploySteps: [], // Handled by action
      githubActionStep: {
        name: 'Deploy to Cloudflare Pages',
        uses: 'cloudflare/wrangler-action@v3',
        with: {
          apiToken: '${{ secrets.CLOUDFLARE_API_TOKEN }}',
          accountId: '${{ secrets.CLOUDFLARE_ACCOUNT_ID }}',
          command: 'pages deploy dist --project-name=${{ vars.CLOUDFLARE_PROJECT_NAME }}',
          workingDirectory: 'apps/frontend',
        },
      },
    };
  }
}
