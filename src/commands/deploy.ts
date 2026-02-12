import { BaseCommand, runCommand } from '@nexical/cli-core';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface DeployOptions {
  dryRun: boolean;
  railwayToken?: string;
  cloudflareToken?: string;
  cloudflareAccount?: string;
}

export default class DeployCommand extends BaseCommand {
  static description = 'Deploy the application to Railway and Cloudflare.';

  static args = {
    options: [
      {
        name: '--dry-run',
        description: 'Simulate the deployment process without making changes.',
        default: false,
      },
      {
        name: '--railway-token <token>',
        description: 'Railway Project Token (optional if already logged in).',
      },
      {
        name: '--cloudflare-token <token>',
        description: 'Cloudflare API Token.',
      },
      {
        name: '--cloudflare-account <id>',
        description: 'Cloudflare Account ID.',
      },
    ],
  };

  async run(options: DeployOptions) {
    this.info('Starting Nexical Deployment Automation...');

    if (options.dryRun) {
      this.notice('DRY RUN MODE ENABLED');
    }

    try {
      // 1. Railway Setup
      await this.setupRailway(options);

      // 2. Cloudflare Setup
      await this.setupCloudflare(options);

      // 3. GitHub Secrets Setup
      await this.setupGitHubSecrets(options);

      this.success('Deployment setup complete! Your application is being deployed.');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(`Deployment failed: ${error.message}`);
      } else {
        this.error(`Deployment failed: ${String(error)}`);
      }
      process.exit(1);
    }
  }

  private async setupRailway(options: DeployOptions) {
    this.info('Configuring Railway...');

    if (options.dryRun) {
      this.info('[Dry Run] Would run: railway init');
      this.info('[Dry Run] Would run: railway add --database postgres');
      return;
    }

    try {
      // Check if railway project exists or init
      // Note: railway init might be interactive, so we might need to handle that or assume user has linked.
      // For now, let's assume we use 'railway link' if they passed a token or have it set.

      this.info('Ensuring Railway project is linked...');
      // If they provided a token, we should probably set it in the environment for subsequent calls
      if (options.railwayToken) {
        process.env.RAILWAY_TOKEN = options.railwayToken;
      }

      // Check if we are in a railway project
      try {
        await runCommand('railway status');
      } catch {
        this.info('No Railway project detected. Initializing...');
        await runCommand('railway init');
      }

      this.info('Adding PostgreSQL service if missing...');
      // railway add --database postgres is usually safe to run twice but we should check status
      const { stdout: status } = await execAsync('railway status');
      if (!status.includes('postgres')) {
        await runCommand('railway add --database postgres');
      }
    } catch (e: unknown) {
      this.warn(
        'Railway setup encountered an issue. Ensure you are logged in with `railway login`.',
      );
      throw e;
    }
  }

  private async setupCloudflare(options: DeployOptions) {
    this.info('Configuring Cloudflare Pages...');

    if (options.dryRun) {
      this.info('[Dry Run] Would run: wrangler pages project create nexical-frontend');
      return;
    }

    if (!options.cloudflareToken || !options.cloudflareAccount) {
      this.warn('Cloudflare credentials missing. Skipping automated Cloudflare setup.');
      this.info('You can manually set up Cloudflare Pages and add the secrets to GitHub.');
      return;
    }

    try {
      // Use wrangler to create project if it doesn't exist
      // We assume project name 'nexical-frontend' for now, should be configurable.
      const projectName = 'nexical-frontend';
      this.info(`Ensuring Cloudflare Pages project "${projectName}" exists...`);

      try {
        await execAsync(`wrangler pages project create ${projectName} --production-branch main`, {
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: options.cloudflareToken,
            CLOUDFLARE_ACCOUNT_ID: options.cloudflareAccount,
          },
        });
      } catch {
        this.info('Cloudflare project might already exist.');
      }
    } catch (e: unknown) {
      this.warn('Cloudflare setup failed.');
      throw e;
    }
  }

  private async setupGitHubSecrets(options: DeployOptions) {
    this.info('Configuring GitHub Secrets...');

    if (options.dryRun) {
      this.info('[Dry Run] Would run: gh secret set RAILWAY_TOKEN');
      this.info('[Dry Run] Would run: gh secret set CLOUDFLARE_API_TOKEN');
      this.info('[Dry Run] Would run: gh secret set CLOUDFLARE_ACCOUNT_ID');
      return;
    }

    try {
      // We need the Railway Project Token.
      // User might have provided it, or we try to get it from railway tokens?
      // Railway CLI doesn't easily expose the project token via CLI easily without a lot of parsing.
      // Usually users generate it in the UI.
      // If they provided it via --railway-token, we use it.

      if (options.railwayToken) {
        this.info('Setting RAILWAY_TOKEN in GitHub...');
        await runCommand(`gh secret set RAILWAY_TOKEN --body "${options.railwayToken}"`);
      }

      if (options.cloudflareToken) {
        this.info('Setting CLOUDFLARE_API_TOKEN in GitHub...');
        await runCommand(`gh secret set CLOUDFLARE_API_TOKEN --body "${options.cloudflareToken}"`);
      }

      if (options.cloudflareAccount) {
        this.info('Setting CLOUDFLARE_ACCOUNT_ID in GitHub...');
        await runCommand(
          `gh secret set CLOUDFLARE_ACCOUNT_ID --body "${options.cloudflareAccount}"`,
        );
      }
    } catch (e: unknown) {
      this.warn(
        'GitHub Secrets setup failed. Ensure you have the GitHub CLI (gh) installed and are logged in.',
      );
      throw e;
    }
  }
}
