import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dotenv from 'dotenv';
import DeployCommand from '../../../src/commands/deploy.js';

// Fully mock the modules to return classes
vi.mock('../../../src/deploy/config-manager.js', () => {
  return {
    ConfigManager: vi.fn().mockImplementation(function () {
      return {
        load: vi.fn().mockResolvedValue({
          deploy: {
            backend: { provider: 'railway' },
            frontend: { provider: 'cloudflare' },
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
        getDeploymentProvider: vi.fn(),
        getRepositoryProvider: vi.fn(),
      };
    }),
  };
});

vi.mock('dotenv');
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

// Import them after vi.mock to get the mocked versions
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import { ProviderRegistry } from '../../../src/deploy/registry.js';

describe('DeployCommand', () => {
  let command: DeployCommand;
  let mockRegistry: {
    loadCoreProviders: any;
    loadLocalProviders: any;
    getDeploymentProvider: any;
    getRepositoryProvider: any;
  };
  let mockConfigManager: { load: any };

  beforeEach(() => {
    vi.clearAllMocks();

    command = new DeployCommand({} as unknown as any, { rootDir: '/mock/root' });
    (command as unknown as { projectRoot: string }).projectRoot = '/mock/root';

    // Get the instance that will be returned by the constructor
    mockConfigManager = {
      load: vi.fn().mockResolvedValue({
        deploy: {
          backend: { provider: 'railway' },
          frontend: { provider: 'cloudflare' },
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
      getDeploymentProvider: vi.fn(),
      getRepositoryProvider: vi.fn(),
    };
    vi.mocked(ProviderRegistry).mockImplementation(function () {
      return mockRegistry;
    });

    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'error').mockImplementation(() => {
      throw new Error('CLI ERROR');
    });
    vi.spyOn(command, 'success').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run a full deployment successfully', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({ B_SEC: 'val' }),
      getVariables: vi.fn().mockResolvedValue({ B_VAR: 'val' }),
    };
    const mockFrontend = {
      name: 'cloudflare',
      provision: vi.fn().mockResolvedValue(undefined),
      getSecrets: vi.fn().mockResolvedValue({ F_SEC: 'val' }),
      getVariables: vi.fn().mockResolvedValue({ F_VAR: 'val' }),
    };
    const mockRepo = {
      name: 'github',
      configureSecrets: vi.fn().mockResolvedValue(undefined),
      configureVariables: vi.fn().mockResolvedValue(undefined),
      generateWorkflow: vi.fn().mockResolvedValue(undefined),
    };

    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockBackend;
      if (name === 'cloudflare') return mockFrontend;
      return undefined;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue(mockRepo);

    await command.run({ env: 'production' });

    expect(dotenv.config).toHaveBeenCalled();
    expect(mockBackend.provision).toHaveBeenCalled();
    expect(mockFrontend.provision).toHaveBeenCalled();
    expect(mockRepo.configureSecrets).toHaveBeenCalled();
    expect(mockRepo.configureVariables).toHaveBeenCalled();
    expect(mockRepo.generateWorkflow).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith('Deployment configuration complete!');
  });

  it('should error if backend provider is missing', async () => {
    mockConfigManager.load.mockResolvedValue({ deploy: { frontend: { provider: 'cf' } } });
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should error if frontend provider is missing', async () => {
    mockConfigManager.load.mockResolvedValue({ deploy: { backend: { provider: 'rw' } } });
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should error if repo provider is missing', async () => {
    mockConfigManager.load.mockResolvedValue({
      deploy: { backend: { provider: 'rw' }, frontend: { provider: 'cf' } },
    });
    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should throw if provider is not found in registry', async () => {
    mockRegistry.getDeploymentProvider.mockReturnValue(undefined);
    await expect(command.run({ backend: 'unknown' })).rejects.toThrow(
      "Backend provider 'unknown' not found.",
    );
  });

  it('should handle errors during secret resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockRejectedValue(new Error('Secret fail')),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    mockRegistry.getDeploymentProvider.mockReturnValue(mockBackend);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle non-Error exceptions during secret resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockRejectedValue('String error'),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    mockRegistry.getDeploymentProvider.mockReturnValue(mockBackend);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle errors during variable resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockRejectedValue(new Error('Var fail')),
    };
    mockRegistry.getDeploymentProvider.mockReturnValue(mockBackend);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle non-Error exceptions during variable resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockRejectedValue('String var fail'),
    };
    mockRegistry.getDeploymentProvider.mockReturnValue(mockBackend);
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });
  it('should handle errors during frontend secret resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    const mockFrontend = {
      name: 'cloudflare',
      provision: vi.fn(),
      getSecrets: vi.fn().mockRejectedValue(new Error('Front secret fail')),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockBackend;
      if (name === 'cloudflare') return mockFrontend;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle non-Error exceptions during frontend secret resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    const mockFrontend = {
      name: 'cloudflare',
      provision: vi.fn(),
      getSecrets: vi.fn().mockRejectedValue('String front secret fail'),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockBackend;
      if (name === 'cloudflare') return mockFrontend;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle errors during frontend variable resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    const mockFrontend = {
      name: 'cloudflare',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockRejectedValue(new Error('Front var fail')),
    };
    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockBackend;
      if (name === 'cloudflare') return mockFrontend;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should handle non-Error exceptions during frontend variable resolution', async () => {
    const mockBackend = {
      name: 'railway',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockResolvedValue({}),
    };
    const mockFrontend = {
      name: 'cloudflare',
      provision: vi.fn(),
      getSecrets: vi.fn().mockResolvedValue({}),
      getVariables: vi.fn().mockRejectedValue('String front var fail'),
    };
    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return mockBackend;
      if (name === 'cloudflare') return mockFrontend;
    });
    mockRegistry.getRepositoryProvider.mockReturnValue({
      configureSecrets: vi.fn(),
      configureVariables: vi.fn(),
      generateWorkflow: vi.fn(),
    });

    await expect(command.run({})).rejects.toThrow('CLI ERROR');
  });

  it('should throw if frontend provider is not found in registry', async () => {
    mockRegistry.getDeploymentProvider.mockImplementation((name: string) => {
      if (name === 'railway') return { name: 'railway' };
      return undefined;
    });
    await expect(command.run({ frontend: 'unknown' })).rejects.toThrow(
      "Frontend provider 'unknown' not found.",
    );
  });

  it('should throw if repo provider is not found in registry', async () => {
    mockRegistry.getDeploymentProvider.mockReturnValue({ name: 'mock' });
    mockRegistry.getRepositoryProvider.mockReturnValue(undefined);
    await expect(command.run({ repo: 'unknown' })).rejects.toThrow(
      "Repository provider 'unknown' not found.",
    );
  });
});
