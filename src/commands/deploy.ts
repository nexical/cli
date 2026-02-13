import path from 'node:path';
import dotenv from 'dotenv';
import { BaseCommand } from '@nexical/cli-core';
import { ConfigManager } from '../deploy/config-manager';
import { ProviderRegistry } from '../deploy/registry';
import { DeploymentContext } from '../deploy/types';

export default class DeployCommand extends BaseCommand {
  static description = `Deploy the application based on nexical.yaml configuration.

This command orchestrates the deployment of your frontend and backend applications 
by interacting with the providers specified in your configuration file.

CONFIGURATION:
- Requires a 'nexical.yaml' file in the project root.
- If the file or specific sections are missing, the CLI will prompt you to run an interactive setup 
  and save the configuration for future uses.
- Supports loading environment variables from a .env file in the project root.

PROVIDERS:
- Backend: Railway, etc.
- Frontend: Cloudflare Pages, etc.
- Repository: GitHub, GitLab, etc.

PROCESS:
1. Loads environment variables from '.env'.
2. Loads configuration from 'nexical.yaml'.
3. Provisions resources via the selected providers.
4. Configures the repository (secrets/variables) for CI/CD.
5. Generates CI/CD workflow files.`;

  static args = {
    options: [
      {
        name: '--backend <provider>',
        description: 'Override backend provider',
      },
      {
        name: '--frontend <provider>',
        description: 'Override frontend provider',
      },
      {
        name: '--repo <provider>',
        description: 'Override repositroy provider',
      },
      {
        name: '--dry-run',
        description: 'Simulate the deployment process',
        default: false,
      },
    ],
  };

  async run(options: Record<string, unknown>) {
    this.info('Starting Nexical Deployment...');

    // Load environment variables from .env
    dotenv.config({ path: path.join(process.cwd(), '.env') });

    const configManager = new ConfigManager(process.cwd());
    const config = await configManager.load();
    const registry = new ProviderRegistry();

    // Register core and local providers
    await registry.loadCoreProviders();
    await registry.loadLocalProviders(process.cwd());

    // Resolve providers (CLI flags > Config > Error)
    const backendProviderName =
      (options.backend as string | undefined) || config.deploy?.backend?.provider;
    if (!backendProviderName) {
      this.error(
        "Backend provider not specified. Use --backend flag or configure 'deploy.backend.provider' in nexical.yaml.",
      );
    }

    const frontendProviderName =
      (options.frontend as string | undefined) || config.deploy?.frontend?.provider;
    if (!frontendProviderName) {
      this.error(
        "Frontend provider not specified. Use --frontend flag or configure 'deploy.frontend.provider' in nexical.yaml.",
      );
    }

    const repoProviderName =
      (options.repo as string | undefined) || config.deploy?.repository?.provider;
    if (!repoProviderName) {
      this.error(
        "Repository provider not specified. Use --repo flag or configure 'deploy.repository.provider' in nexical.yaml.",
      );
    }

    const backendProvider = registry.getDeploymentProvider(backendProviderName!);
    const frontendProvider = registry.getDeploymentProvider(frontendProviderName!);
    const repoProvider = registry.getRepositoryProvider(repoProviderName!);

    if (!backendProvider) throw new Error(`Backend provider '${backendProviderName}' not found.`);
    if (!frontendProvider)
      throw new Error(`Frontend provider '${frontendProviderName}' not found.`);
    if (!repoProvider) throw new Error(`Repository provider '${repoProviderName}' not found.`);

    const context: DeploymentContext = {
      cwd: process.cwd(),
      config,
      options,
    };

    // Provision
    this.info(`Provisioning Backend with ${backendProvider.name}...`);
    await backendProvider.provision(context);

    this.info(`Provisioning Frontend with ${frontendProvider.name}...`);
    await frontendProvider.provision(context);

    // Configure Repo
    this.info(`Configuring Repository with ${repoProvider.name}...`);

    const secrets: Record<string, string> = {};

    // Collect secrets from Backend Provider
    this.info(`Resolving secrets from ${backendProvider.name}...`);
    try {
      const backendSecrets = await backendProvider.getSecrets(context);
      Object.assign(secrets, backendSecrets);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.error(`Failed to resolve secrets for ${backendProvider.name}: ${message}`);
    }

    // Collect secrets from Frontend Provider
    this.info(`Resolving secrets from ${frontendProvider.name}...`);
    try {
      const frontendSecrets = await frontendProvider.getSecrets(context);
      Object.assign(secrets, frontendSecrets);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.error(`Failed to resolve secrets for ${frontendProvider.name}: ${message}`);
    }

    await repoProvider.configureSecrets(context, secrets);

    const variables: Record<string, string> = {};

    // Collect variables from Backend Provider
    try {
      const backendVars = await backendProvider.getVariables(context);
      Object.assign(variables, backendVars);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.error(`Failed to resolve variables for ${backendProvider.name}: ${message}`);
    }

    // Collect variables from Frontend Provider
    try {
      const frontendVars = await frontendProvider.getVariables(context);
      Object.assign(variables, frontendVars);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      this.error(`Failed to resolve variables for ${frontendProvider.name}: ${message}`);
    }

    await repoProvider.configureVariables(context, variables);

    // Generate Workflows
    this.info('Generating CI/CD Workflows...');
    await repoProvider.generateWorkflow(context, [backendProvider, frontendProvider]);

    this.success('Deployment configuration complete!');
  }
}
