export interface DeploymentError extends Error {
  output?: string;
  code?: number | null;
}

export interface CIConfig {
  secrets: string[];
  variables: string[];
  installSteps?: string[];
  buildSteps?: string[];
  deploySteps?: string[];
  // Platform specific overrides (e.g. uses: action/...)
  githubActionStep?: Record<string, unknown>;
}

export interface AppConfig {
  name: string;
  provider: string;
  projectName?: string;
  target?: string;
  buildCommand?: string;
  artifactPath?: string;
  paths?: string[];
  options?: Record<string, unknown>;
  env?: Record<string, string>;
  secrets?: Record<string, string>;
  domain?: string | string[];
  dnsTarget?: string;
  dev?: {
    port?: number;
  };
  [key: string]: unknown;
}

export interface DeploymentContext {
  cwd: string;
  config: NexicalConfig;
  options: Record<string, unknown>;
}

export interface HostingProvider {
  name: string;

  // Interactive or automatic setup of the provider resources
  provision(context: DeploymentContext, app: AppConfig): Promise<void>;

  // Returns the CI configuration for this provider
  getCIConfig(repoType: 'github' | 'gitlab', app: AppConfig): CIConfig;

  // Returns a map of secrets to be set in the repository (e.g. tokens, account IDs)
  // The provider is responsible for resolving these from config/env and throwing if missing.
  getSecrets(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>>;

  // Returns a map of variables to be set in the repository (e.g. project names, service names)
  getVariables(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>>;

  // Performs a manual build/deployment from the local machine
  deploy?(context: DeploymentContext, app: AppConfig): Promise<void>;

  // Optional: Automatically infer the DnsTarget from the hosting configuration
  getDefaultDnsTarget?(app: AppConfig): string | undefined;
}

export interface RepositoryProvider {
  name: string;

  // Sets secrets/variables in the repo
  configureSecrets(context: DeploymentContext, secrets: Record<string, string>): Promise<void>;
  configureVariables(context: DeploymentContext, variables: Record<string, string>): Promise<void>;

  // Generates and writes the CI workflow files
  generateWorkflow(
    context: DeploymentContext,
    targets: { provider: HostingProvider; app: AppConfig }[],
  ): Promise<void>;
}

export interface NexicalConfig {
  deploy?: {
    apps?: Record<string, Omit<AppConfig, 'name'>>;
    repository?: {
      provider: string;
      options?: Record<string, unknown>;
    };
    dns?: {
      provider: string;
      [key: string]: unknown;
    };
  };
}

export interface DnsRecord {
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
}

export interface DnsProvider {
  name: string;
  type?: 'dns';
  provision(context: DeploymentContext, records: DnsRecord[]): Promise<void>;
}
