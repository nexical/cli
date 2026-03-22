import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import process from 'node:process';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import { ProviderRegistry } from '../../../src/deploy/registry.js';
import { EnvManager } from '../../../src/utils/env-manager.js';
import {
  NexicalConfig,
  HostingProvider,
  RepositoryProvider,
  DnsProvider,
} from '../../../src/deploy/types.js';
import DeployCommand from '../../../src/commands/deploy.js';

// Unified mocks for deploy utilities using string literals (required for hoisting)
vi.mock('../../../src/deploy/utils', () => ({
  execAsync: vi.fn().mockResolvedValue({ stdout: 'mocked', stderr: '' }),
  spawnAsync: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/deploy/utils.js', () => ({
  execAsync: vi.fn().mockResolvedValue({ stdout: 'mocked', stderr: '' }),
  spawnAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@nexical/cli-core', () => ({
  BaseCommand: class {
    cli: unknown;
    globalOptions: unknown;
    projectRoot: string = '/mock/root';
    constructor(cli: unknown, options: unknown) {
      this.cli = cli;
      this.globalOptions = options;
    }
    init = vi.fn().mockResolvedValue(undefined);
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    success = vi.fn();
  },
}));

vi.mock('../../../src/deploy/config-manager.js');
vi.mock('../../../src/deploy/registry.js');
vi.mock('../../../src/utils/env-manager.js');
vi.mock('../../../src/commands/setup.js', () => ({
  __esModule: true,
  default: class {
    init = vi.fn().mockResolvedValue(undefined);
    run = vi.fn().mockResolvedValue(undefined);
  },
}));
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

describe('DeployCommand', () => {
  let command: DeployCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    command = new DeployCommand({}, { rootDir: '/mock/root' });

    // Explicitly mock BaseCommand methods on the instance
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});

    // Mock process.exit to do nothing
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    // Mock process.cwd
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/root');

    await command.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run the full deployment flow', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'hosting1', domain: 'test.com' },
        },
        dns: { provider: 'dns1' },
        repository: { provider: 'repo1' },
      },
    };

    const mockHostingProvider = {
      name: 'hosting1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({ SECRET: 'val' }),
      getVariables: vi.fn().mockResolvedValue({ VAR: 'val' }),
      getDefaultDnsTarget: vi.fn().mockReturnValue('target.io'),
    };

    const mockRepoProvider = {
      name: 'repo1',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockHostingProvider as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue(
      mockRepoProvider as unknown as RepositoryProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue({
      name: 'dns',
      provision: vi.fn().mockResolvedValue(undefined),
    } as unknown as DnsProvider);

    await command.run({});

    expect(EnvManager.prototype.ensureEnv).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith('Deployment configuration complete!');
  });

  it('should handle manual deployment with build command', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { provider: 'hosting1', buildCommand: 'npm run build' },
        },
        repository: { provider: 'repo1' },
      },
    };

    const mockHostingProvider = {
      name: 'hosting1',
      provision: vi.fn().mockResolvedValue(undefined),
      deploy: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockHostingProvider as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    const { execAsync } = await import('../../../src/deploy/utils');

    await command.run({ manual: true });

    expect(execAsync).toHaveBeenCalledWith('npm run build', expect.anything());
    expect(mockHostingProvider.deploy).toHaveBeenCalled();
  });

  it('should error if filtered app is missing', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { app1: {} }, repository: { provider: 'r1' } },
    } as unknown as NexicalConfig);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({ apps: 'missing' });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('not found in nexical.yaml: missing'),
    );
  });

  it('should error if hosting provider is not found', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { app1: { provider: 'unknown' } }, repository: { provider: 'r1' } },
    } as unknown as NexicalConfig);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(undefined);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining("Provider 'unknown' not found"),
    );
  });

  it('should handle secret and variable resolution failures', async () => {
    const mockConfig = {
      deploy: { apps: { app1: { provider: 'h1' } }, repository: { provider: 'r1' } },
    };
    const mockH = {
      name: 'h1',
      provision: vi.fn(),
      getSecrets: vi.fn().mockRejectedValue(new Error('secret fail')),
      getVariables: vi.fn().mockRejectedValue(new Error('var fail')),
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockH as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve secrets for app1 (h1): secret fail'),
    );
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to resolve variables for app1 (h1): var fail'),
    );
  });

  it('should handle DNS provisioning failures and edge cases', async () => {
    const mockConfig = {
      deploy: {
        apps: { app1: { provider: 'h1', domain: 'app.com' } },
        dns: { provider: 'dns1' },
        repository: { provider: 'r1' },
      },
    };
    const mockDns = { name: 'dns1', provision: vi.fn().mockRejectedValue(new Error('dns fail')) };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
      getDefaultDnsTarget: () => '1.2.3.4',
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue(
      mockDns as unknown as DnsProvider,
    );

    await command.run({});
    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('DNS provisioning failed: dns fail'),
    );

    // Test missing target
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
      getDefaultDnsTarget: () => undefined,
    } as unknown as HostingProvider);
    await command.run({});
    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining("specifies domain(s) but no 'dnsTarget' could be inferred"),
    );
  });

  it('should handle dry run', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { provider: 'hosting1', buildCommand: 'npm run build' },
        },
        repository: { provider: 'repo1' },
      },
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({ dryRun: true, manual: true });

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run] Would run build'));
    const { execAsync } = await import('../../../src/deploy/utils');
    expect(execAsync).not.toHaveBeenCalled();
  });

  it('should perform DNS provisioning if configured', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { provider: 'hosting1', domain: 'app.example.com' },
        },
        repository: { provider: 'repo1' },
        dns: { provider: 'dns1' },
      },
    };

    const mockDnsProvider = {
      name: 'dns1',
      provision: vi.fn().mockResolvedValue(undefined),
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
      getDefaultDnsTarget: () => '1.2.3.4',
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue(
      mockDnsProvider as unknown as DnsProvider,
    );

    await command.run({});

    expect(mockDnsProvider.provision).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ name: 'app.example.com', content: '1.2.3.4' }),
      ]),
    );
  });

  it('should handle build errors in manual deployment', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { provider: 'hosting1', buildCommand: 'fail' },
        },
        repository: { provider: 'repo1' },
      },
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    const { execAsync } = await import('../../../src/deploy/utils');
    vi.mocked(execAsync).mockRejectedValue(new Error('build failed') as never);

    await command.run({ manual: true });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Build failed for app1: build failed'),
    );
  });

  it('should handle getSecrets and getVariables catch blocks', async () => {
    const mockConfig = {
      deploy: { apps: { app1: { provider: 'h1' } }, repository: { provider: 'r1' } },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    const mockH = {
      name: 'h1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockRejectedValue('Secret Fail'),
      getVariables: vi.fn().mockRejectedValue('Var Fail'),
      getCIConfig: vi.fn(),
    };
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockH as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Secret Fail'));
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Var Fail'));
  });

  it.skip('should warn if defaultDnsTarget is missing', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: {
        apps: { app1: { provider: 'h1', domain: 'a.com', buildCommand: 'test' } },
        dns: { provider: 'dns1' },
      },
    } as unknown as NexicalConfig);
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h1',
      provision: vi.fn().mockResolvedValue({}),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
      getDefaultDnsTarget: vi.fn().mockResolvedValue(undefined),
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue({
      name: 'dns1',
      provision: vi.fn().mockResolvedValue({ success: true }),
    } as unknown as DnsProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue({}),
      configureVariables: vi.fn().mockResolvedValue({}),
      generateWorkflow: vi.fn().mockResolvedValue({}),
    } as unknown as RepositoryProvider);

    await command.run({ dns: true });
    expect(command.warn).toHaveBeenCalled();
  });

  it('should error if repository provider is missing', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { app1: {} } },
    } as unknown as NexicalConfig);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Repository provider not specified'),
    );
  });

  it('should inject PUBLIC_API_URL for frontend if backend has domain', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          frontend: { provider: 'h1', projectName: 'fe', buildCommand: 'npm run build' },
          backend: {
            provider: 'h2',
            projectName: 'be',
            domain: ['api.ex.com'],
            buildCommand: 'npm run build',
          },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );

    const mockHostingProvider = {
      name: 'h1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockHostingProvider as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({ manual: true, dryRun: true });
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('Injected PUBLIC_API_URL=https://api.ex.com/api'),
    );
  }, 10000);

  it('should handle dry run with environment overrides', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: {
            provider: 'h1',
            env: { CUSTOM_VAR: 'CUSTOM_VAL' },
            buildCommand: 'npm run build',
          },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );

    const mockHostingProvider = {
      name: 'h1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockHostingProvider as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({ dryRun: true });
    expect(command.info).toHaveBeenCalledWith(
      expect.stringContaining('[Dry Run] Environment overrides: CUSTOM_VAR=CUSTOM_VAL'),
    );
  }, 10000);

  it('should handle array of domains and missing getDefaultDnsTarget', async () => {
    const mockConfig = {
      deploy: {
        apps: { app1: { provider: 'h1', domain: ['a.com', 'b.com'] } },
        dns: { provider: 'dns1' },
        repository: { provider: 'r1' },
      },
    };
    // Provider WITHOUT getDefaultDnsTarget
    const mockH = { name: 'h1', provision: vi.fn(), getSecrets: vi.fn(), getVariables: vi.fn() };
    const mockDns = { name: 'dns1', provision: vi.fn() };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockH as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue(
      mockDns as unknown as DnsProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({});
    // Should NOT call dnsProvider.provision because target is missing (and h1 doesn't provide default)
    expect(mockDns.provision).not.toHaveBeenCalled();
  });

  it('should handle non-Error objects in DNS catch', async () => {
    const mockConfig = {
      deploy: {
        apps: { app1: { provider: 'h1', domain: 'a.com' } },
        dns: { provider: 'dns1' },
        repository: { provider: 'r1' },
      },
    };
    const mockH = {
      name: 'h1',
      provision: vi.fn(),
      getSecrets: vi.fn(),
      getVariables: vi.fn(),
      getDefaultDnsTarget: () => '1.2.3.4',
    };
    const mockDns = { name: 'dns1', provision: vi.fn().mockRejectedValue('DNS Fail String') };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue(
      mockH as unknown as HostingProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue(
      mockDns as unknown as DnsProvider,
    );
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    await command.run({});
    expect(command.warn).toHaveBeenCalledWith(
      expect.stringContaining('DNS provisioning failed: DNS Fail String'),
    );
  });

  it('should handle verbose logging in deployApp', async () => {
    const mockConfig = {
      deploy: { apps: { app1: { provider: 'h1' } }, repository: { provider: 'r1' } },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getRepositoryProvider).mockReturnValue({
      name: 'r',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    } as unknown as RepositoryProvider);

    const verboseCommand = new DeployCommand({ verbose: true }, { rootDir: '/mock/root' });
    vi.spyOn(verboseCommand, 'info').mockImplementation(() => {});
    await verboseCommand.init();
    await verboseCommand.run({});

    expect(verboseCommand.info).toHaveBeenCalledWith(
      expect.stringContaining('  Provisioning app1 with h1...'),
    );
  });

  it('should error if DNS provider is missing', async () => {
    const mockConfig = {
      deploy: {
        apps: { app1: { provider: 'h1' } },
        dns: { provider: 'missing-dns' },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(ProviderRegistry.prototype.getHostingProvider).mockReturnValue({
      name: 'h1',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    } as unknown as HostingProvider);
    vi.mocked(ProviderRegistry.prototype.getDnsProvider).mockReturnValue(undefined);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining("DNS provider 'missing-dns' not found"),
    );
  });
});
