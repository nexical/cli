import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dotenv from 'dotenv';
import DeployCommand from '../../../src/commands/deploy.js';

vi.mock('../../../src/deploy/config-manager.js', () => {
  return {
    ConfigManager: vi.fn().mockImplementation(function () {
      return {
        load: vi.fn().mockResolvedValue({
          deploy: {
            apps: {
              api: { provider: 'railway' },
              web: { provider: 'vercel' },
            },
            repository: { provider: 'github' },
          },
        }),
      };
    }),
  };
});

vi.mock('../../../src/deploy/registry.js', () => {
  return {
    ProviderRegistry: vi.fn().mockImplementation(function () {
      return {
        loadCoreProviders: vi.fn(),
        loadLocalProviders: vi.fn(),
        getHostingProvider: vi.fn(),
        getRepositoryProvider: vi.fn(),
        getDnsProvider: vi.fn(),
      };
    }),
  };
});

vi.mock('dotenv');
vi.mock('../../../src/utils/env-manager.js');
vi.mock('../../../src/commands/setup.js');
vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
  };
});

import { ConfigManager } from '../../../src/deploy/config-manager.js';
import { ProviderRegistry } from '../../../src/deploy/registry.js';
import { EnvManager } from '../../../src/utils/env-manager.js';
import SetupCommand from '../../../src/commands/setup.js';

describe('DeployCommand', () => {
  let command: DeployCommand;
  let mockRegistry: {
    loadCoreProviders: ReturnType<typeof vi.fn>;
    loadLocalProviders: ReturnType<typeof vi.fn>;
    getHostingProvider: ReturnType<typeof vi.fn>;
    getRepositoryProvider: ReturnType<typeof vi.fn>;
    getDnsProvider: ReturnType<typeof vi.fn>;
  };
  let mockConfigManager: { load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    command = new DeployCommand({} as never, { rootDir: '/mock/root' } as never);
    (command as unknown as { projectRoot: string }).projectRoot = '/mock/root';

    mockConfigManager = {
      load: vi.fn().mockResolvedValue({
        deploy: {
          apps: {
            api: { provider: 'railway' },
            web: { provider: 'vercel' },
          },
          repository: { provider: 'github' },
        },
      }),
    };
    vi.mocked(ConfigManager).mockImplementation(function () {
      return mockConfigManager;
    });

    mockRegistry = {
      loadCoreProviders: vi.fn(),
      loadLocalProviders: vi.fn(),
      getHostingProvider: vi.fn(),
      getRepositoryProvider: vi.fn(),
      getDnsProvider: vi.fn(),
    };
    vi.mocked(ProviderRegistry).mockImplementation(function () {
      return mockRegistry;
    });

    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'error').mockImplementation(() => {
      throw new Error('CLI ERROR');
    });
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run a full deployment successfully', async () => {
    const mockApi = {
      name: 'railway',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({ API_SEC: 'val' }),
      getVariables: vi.fn().mockResolvedValue({ API_VAR: 'val' }),
    };
    const mockWeb = {
      name: 'vercel',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({ WEB_SEC: 'val' }),
      getVariables: vi.fn().mockResolvedValue({ WEB_VAR: 'val' }),
    };
    const mockRepo = {
      name: 'github',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    };

    mockRegistry.getHostingProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockApi;
      if (name === 'vercel') return mockWeb;
      return undefined;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue(mockRepo);

    await command.run({ env: 'production' });

    expect(EnvManager.prototype.ensureEnv).toHaveBeenCalled();
    expect(dotenv.config).toHaveBeenCalled();
    expect(SetupCommand.prototype.init).toHaveBeenCalled();
    expect(SetupCommand.prototype.run).toHaveBeenCalled();
    expect(mockApi.provision).toHaveBeenCalled();
    expect(mockWeb.provision).toHaveBeenCalled();
    expect(mockRepo.configureSecrets).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ API_SEC: 'val', WEB_SEC: 'val' }),
    );
    expect(mockRepo.configureVariables).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ API_VAR: 'val', WEB_VAR: 'val' }),
    );
    expect(mockRepo.generateWorkflow).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith('Deployment configuration complete!');
  });

  it('should filter apps if --apps is provided', async () => {
    const mockApi = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    mockRegistry.getHostingProvider.mockReturnValue(mockApi);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await command.run({ apps: 'api' });
    expect(mockApi.provision).toHaveBeenCalledTimes(1);
    expect(command.success).toHaveBeenCalledWith('Deployment configuration complete!');
  });

  it('should error if no apps found', async () => {
    mockConfigManager.load.mockResolvedValue({ deploy: {} });
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
    expect(command.error).toHaveBeenCalledWith(
      'No applications found in nexical.yaml. Please configure [deploy.apps].',
    );
  });

  it('should error if requested app is missing', async () => {
    await expect(command.run({ apps: 'missing' })).rejects.toThrow('CLI ERROR');
    expect(command.error).toHaveBeenCalledWith(
      'The following applications were not found in nexical.yaml: missing',
    );
  });

  it('should error if repo provider is missing', async () => {
    mockConfigManager.load.mockResolvedValue({
      deploy: { apps: { api: { provider: 'pw' } } },
    });
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Repository provider not specified'),
    );
  });

  it('should throw if provider is not found for an app', async () => {
    mockRegistry.getHostingProvider.mockReturnValue(undefined);
    mockRegistry.getRepositoryProvider.mockReturnValue({});
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
    expect(command.error).toHaveBeenCalledWith(
      "Provider 'railway' not found for application 'api'.",
    );
  });

  it('should throw if repo provider is not found in registry', async () => {
    mockRegistry.getHostingProvider.mockReturnValue({
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    });
    mockRegistry.getRepositoryProvider.mockReturnValue(undefined);
    await expect(command.run({})).rejects.toThrow("Repository provider 'github' not found.");
  });

  it('should handle DNS provisioning if configured', async () => {
    mockConfigManager.load.mockResolvedValue({
      deploy: {
        apps: {
          web: { provider: 'vercel', domain: 'example.com' },
        },
        repository: { provider: 'github' },
        dns: { provider: 'cloudflare' },
      },
    });

    const mockWeb = {
      name: 'vercel',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
      getDefaultDnsTarget: vi.fn().mockReturnValue('proxy.com'),
    };
    mockRegistry.getHostingProvider.mockReturnValue(mockWeb);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });
    const mockDns = {
      name: 'cloudflare',
      provision: vi.fn().mockResolvedValue(undefined),
    };
    mockRegistry.getDnsProvider.mockReturnValue(mockDns);

    await command.run({});

    expect(mockDns.provision).toHaveBeenCalledWith(expect.anything(), [
      { type: 'CNAME', name: 'example.com', content: 'proxy.com', proxied: true },
    ]);
  });
});
