import { BaseCommand } from '@nexical/cli-core';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execAsync = promisify(exec);

interface DeployOptions {
  dryRun: boolean;
  railwayToken?: string;
  railwayName?: string;
  backendName: string;
  frontendName: string;
  cloudflareToken?: string;
  cloudflareAccount?: string;
}

export default class DeployCommand extends BaseCommand {
  static description = `Deploy the application to Railway and Cloudflare.

ENVIRONMENT SETUP & PREREQUISITES:
1. Install Required CLIs:
   - Railway CLI: npm i -g @railway/cli
   - Wrangler (Cloudflare): npm i -g wrangler
   - GitHub CLI: https://cli.github.com/

2. Authentication:
   - Railway: Run 'railway login'
   - GitHub: Run 'gh auth login'
   - Cloudflare: Obtain an API Token (with Pages edit permissions) and your Account ID from the dashboard.

3. Configuration:
   Run this command with --cloudflare-token and --cloudflare-account to automate the full setup.
   Optional: Use --railway-token if you prefer not to use the interactive login.
   Optional: Use --railway-name to specify a custom Railway project name.
   Optional: Use --backend-name to specify the Railway service name (default: nexical-backend).
   Optional: Use --frontend-name to specify the Cloudflare Pages project name (default: nexical-frontend).

PROCESS:
- Provisions a PostgreSQL database on Railway (if missing).
- Creates a Cloudflare Pages project for the frontend.
- Syncs all necessary deployment secrets and variables to GitHub for CI/CD automation.`;

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
        name: '--railway-name <name>',
        description: 'Railway Project Name (used during initialization).',
      },
      {
        name: '--backend-name <name>',
        description: 'Backend service name on Railway.',
        default: 'nexical-backend',
      },
      {
        name: '--frontend-name <name>',
        description: 'Frontend project name on Cloudflare.',
        default: 'nexical-frontend',
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

      // 3. GitHub Configuration (Secrets & Variables)
      await this.setupGitHubConfig(options);

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
      const initCmd = options.railwayName
        ? `railway init --name ${options.railwayName}`
        : 'railway init';
      this.info(`[Dry Run] Would run: ${initCmd}`);
      this.info('[Dry Run] Would run: railway add --database postgres');
      return;
    }

    try {
      // Check if railway project exists or init
      // Note: railway init might be interactive, so we might need to handle that or assume user has linked.
      // For now, let's assume we use 'railway link' if they passed a token or have it set.

      this.info('Ensuring Railway project is linked...');
      // Note: We intentionally DO NOT set process.env.RAILWAY_TOKEN here.
      // Management commands (init, status, add) require an interactive session (railway login).
      // The provided --railway-token is reserved for GitHub Secrets setup (CI/CD).

      const backendDir = path.join(process.cwd(), 'apps/backend');

      try {
        await execAsync('railway status', { cwd: backendDir });
      } catch {
        const initCmd = options.railwayName
          ? `railway init --name ${options.railwayName}`
          : 'railway init';
        this.info(`No Railway project detected in apps/backend. Initializing with: ${initCmd}`);
        await execAsync(initCmd, { cwd: backendDir });
      }

      this.info(`Adding PostgreSQL service if missing for "${options.backendName}"...`);
      const { stdout: status } = await execAsync('railway status', { cwd: backendDir });
      if (!status.includes('postgres')) {
        await execAsync('railway add --database postgres', { cwd: backendDir });
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
      this.info(`[Dry Run] Would run: wrangler pages project create ${options.frontendName}`);
      return;
    }

    if (!options.cloudflareToken || !options.cloudflareAccount) {
      this.warn('Cloudflare credentials missing. Skipping automated Cloudflare setup.');
      this.info('You can manually set up Cloudflare Pages and add the secrets to GitHub.');
      return;
    }

    try {
      // Use wrangler to create project if it doesn't exist
      const projectName = options.frontendName;
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

  private async setupGitHubConfig(options: DeployOptions) {
    this.info('Configuring GitHub Secrets and Variables...');

    if (options.dryRun) {
      this.info('[Dry Run] Would run: gh secret set RAILWAY_TOKEN');
      this.info('[Dry Run] Would run: gh secret set CLOUDFLARE_API_TOKEN');
      this.info('[Dry Run] Would run: gh secret set CLOUDFLARE_ACCOUNT_ID');
      this.info(
        `[Dry Run] Would run: gh variable set RAILWAY_SERVICE_NAME --body "${options.backendName}"`,
      );
      this.info(
        `[Dry Run] Would run: gh variable set CLOUDFLARE_PROJECT_NAME --body "${options.frontendName}"`,
      );
      return;
    }

    try {
      if (options.railwayToken) {
        this.info('Setting RAILWAY_TOKEN in GitHub...');
        await execAsync(`gh secret set RAILWAY_TOKEN --body "${options.railwayToken}"`);
      }

      if (options.cloudflareToken) {
        this.info('Setting CLOUDFLARE_API_TOKEN in GitHub...');
        await execAsync(`gh secret set CLOUDFLARE_API_TOKEN --body "${options.cloudflareToken}"`);
      }

      if (options.cloudflareAccount) {
        this.info('Setting CLOUDFLARE_ACCOUNT_ID in GitHub...');
        await execAsync(
          `gh secret set CLOUDFLARE_ACCOUNT_ID --body "${options.cloudflareAccount}"`,
        );
      }

      // Set variables
      this.info(`Setting RAILWAY_SERVICE_NAME to "${options.backendName}" in GitHub...`);
      await execAsync(`gh variable set RAILWAY_SERVICE_NAME --body "${options.backendName}"`);

      this.info(`Setting CLOUDFLARE_PROJECT_NAME to "${options.frontendName}" in GitHub...`);
      await execAsync(`gh variable set CLOUDFLARE_PROJECT_NAME --body "${options.frontendName}"`);
    } catch (e: unknown) {
      this.warn(
        'GitHub configuration failed. Ensure you have the GitHub CLI (gh) installed and are logged in.',
      );
      throw e;
    }
  }
}
