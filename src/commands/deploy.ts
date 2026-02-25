import path from 'node:path';
import dotenv from 'dotenv';
import { BaseCommand } from '@nexical/cli-core';
import { ConfigManager } from '../deploy/config-manager';
import { ProviderRegistry } from '../deploy/registry';
import { DeploymentContext, HostingProvider, AppConfig } from '../deploy/types';

export default class DeployCommand extends BaseCommand {
  static usage = 'deploy';
  static description = 'Deploy the application based on nexical.yaml configuration.';
  static help = `This command orchestrates the deployment of your applications 
by interacting with the providers specified in your configuration file.

CONFIGURATION:
- Requires a 'nexical.yaml' file in the project root.
- Supports definition of multiple applications under 'deploy.apps'.
- Supports loading environment variables from a .env file in the project root.

PROCESS:
1. Loads environment variables from '.env'.
2. Loads configuration from 'nexical.yaml'.
3. Provisions resources for each application.
4. Configures the repository (secrets/variables) for CI/CD.
5. Generates CI/CD workflow files for each application.`;

  static args = {
    options: [
      {
        name: '--env <environment>',
        description: 'Deployment environment (e.g. production, staging)',
        default: 'production',
      },
      {
        name: '--dry-run',
        description: 'Simulate the deployment process',
        default: false,
      },
      {
        name: '--apps <apps>',
        description: 'Comma separated list of applications to deploy',
      },
      {
        name: '--manual',
        description: 'Perform a direct build and deployment from the local machine',
        default: false,
      },
      {
        name: '--repo <provider>',
        description: 'Repository provider to use (e.g. github, gitlab)',
      },
    ],
  };

  async run(options: Record<string, unknown>) {
    this.info('Starting Nexical Deployment...');

    // Load environment variables from .env
    dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

    const configManager = new ConfigManager(process.cwd());
    const config = await configManager.load();
    const registry = new ProviderRegistry();

    // Register core and local providers
    await registry.loadCoreProviders();
    await registry.loadLocalProviders(process.cwd());

    // Resolve Applications
    const appsMap = config.deploy?.apps || {};
    let apps: AppConfig[] = Object.entries(appsMap).map(([name, appConfig]) => {
      const app: AppConfig = {
        ...(appConfig as unknown as AppConfig),
        name,
      };
      return app;
    });

    // Filter applications if --apps is specified
    const selectedApps = options.apps as string | undefined;
    if (selectedApps) {
      const appNames = selectedApps.split(',').map((s) => s.trim());
      const filteredApps = apps.filter((app) => appNames.includes(app.name));

      // Validation: Ensure all specified apps exist
      const missingApps = appNames.filter((name) => !apps.find((app) => app.name === name));
      if (missingApps.length > 0) {
        this.error(
          `The following applications were not found in nexical.yaml: ${missingApps.join(', ')}`,
        );
      }

      apps = filteredApps;
    }

    if (apps.length === 0) {
      this.error('No applications found in nexical.yaml. Please configure [deploy.apps].');
    }

    const repoProviderName =
      (options.repo as string | undefined) || config.deploy?.repository?.provider;
    if (!repoProviderName) {
      this.error(
        "Repository provider not specified. Use --repo flag or configure 'deploy.repository.provider' in nexical.yaml.",
      );
    }

    const repoProvider = registry.getRepositoryProvider(repoProviderName!);
    if (!repoProvider) throw new Error(`Repository provider '${repoProviderName}' not found.`);

    const context: DeploymentContext = {
      cwd: process.cwd(),
      config,
      options,
    };

    const activeApps: { provider: HostingProvider; app: AppConfig }[] = [];
    const secrets: Record<string, string> = {};
    const variables: Record<string, string> = {};

    this.info(`Deploying ${apps.length} applications in parallel...`);

    const isManual = !!options.manual;

    await Promise.all(
      apps.map(async (app) => {
        this.info(`Processing application: ${app.name}...`);
        const provider = registry.getHostingProvider(app.provider);
        if (!provider) {
          this.error(`Provider '${app.provider}' not found for application '${app.name}'.`);
          return;
        }

        // Build
        if (isManual && app.buildCommand) {
          this.info(`  Building ${app.name} locally...`);
          if (context.options.dryRun) {
            this.info(`  [Dry Run] Would run build: ${app.buildCommand}`);
          } else {
            try {
              const { execAsync } = await import('../deploy/utils');
              await execAsync(app.buildCommand);
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              this.error(`Build failed for ${app.name}: ${message}`);
              return;
            }
          }
        }

        // Provision
        this.info(`  Provisioning ${app.name} with ${provider.name}...`);
        await provider.provision(context, app);

        // Direct Deploy
        if (isManual && provider.deploy) {
          this.info(`  Performing direct deployment for ${app.name}...`);
          await provider.deploy(context, app);
        }

        // Collect secrets
        this.info(`  Resolving secrets for ${app.name} from ${provider.name}...`);
        try {
          const appSecrets = await provider.getSecrets(context, app);
          Object.assign(secrets, appSecrets);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.error(`Failed to resolve secrets for ${app.name} (${provider.name}): ${message}`);
        }

        // Collect variables
        this.info(`  Resolving variables for ${app.name} from ${provider.name}...`);
        try {
          const appVars = await provider.getVariables(context, app);
          Object.assign(variables, appVars);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          this.error(`Failed to resolve variables for ${app.name} (${provider.name}): ${message}`);
        }

        activeApps.push({ provider, app });
      }),
    );

    // Configure Repo
    this.info(`Configuring Repository with ${repoProvider.name}...`);
    await repoProvider.configureSecrets(context, secrets);
    await repoProvider.configureVariables(context, variables);

    // Generate Workflows
    this.info('Generating CI/CD Workflows...');
    await repoProvider.generateWorkflow(context, activeApps);

    this.success('Deployment configuration complete!');
  }
}
