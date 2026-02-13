export interface CIConfig {
  secrets: string[];
  variables: string[];
  installSteps?: string[];
  buildSteps?: string[];
  deploySteps?: string[];
  // Platform specific overrides (e.g. uses: action/...)
  githubActionStep?: Record<string, unknown>;
}

export interface DeploymentContext {
  cwd: string;
  config: NexicalConfig;
  options: Record<string, unknown>;
}

export interface DeploymentProvider {
  name: string;
  type: 'frontend' | 'backend';

  // Interactive or automatic setup of the provider resources
  provision(context: DeploymentContext): Promise<void>;

  // Returns the CI configuration for this provider
  getCIConfig(repoType: 'github' | 'gitlab'): CIConfig;

  // Returns a map of secrets to be set in the repository (e.g. tokens, account IDs)
  // The provider is responsible for resolving these from config/env and throwing if missing.
  getSecrets(context: DeploymentContext): Promise<Record<string, string>>;

  // Returns a map of variables to be set in the repository (e.g. project names, service names)
  getVariables(context: DeploymentContext): Promise<Record<string, string>>;
}

export interface RepositoryProvider {
  name: string;

  // Sets secrets/variables in the repo
  configureSecrets(context: DeploymentContext, secrets: Record<string, string>): Promise<void>;
  configureVariables(context: DeploymentContext, variables: Record<string, string>): Promise<void>;

  // Generates and writes the CI workflow files
  generateWorkflow(context: DeploymentContext, targets: DeploymentProvider[]): Promise<void>;
}

export interface NexicalConfig {
  deploy?: {
    backend?: {
      provider: string;
      projectName?: string;
      options?: Record<string, unknown>;
    };
    frontend?: {
      provider: string;
      projectName?: string;
      options?: Record<string, unknown>;
    };
    repository?: {
      provider: string;
      options?: Record<string, unknown>;
    };
  };
}
