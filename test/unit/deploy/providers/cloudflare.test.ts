import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { CloudflareProvider } from '../../../../src/deploy/providers/cloudflare.js';
import { execAsync, spawnAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import fs from 'node:fs';
import { DeploymentContext, AppConfig } from '../../../../src/deploy/types.js';

vi.mock('../../../../src/deploy/utils.js', () => ({
  execAsync: vi.fn(),
  spawnAsync: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const mockMkdir = vi.fn();

  // We need to handle the case where default might or might not exist on the actual object
  // cast to unknown first to safely check/access properties that TS doesn't see on the module type
  const actualObj = actual as unknown as Record<string, unknown>;
  const actualDefault = (actualObj.default as typeof import('node:fs')) || actual;

  return {
    ...actual,
    promises: {
      ...actual.promises,
      mkdir: mockMkdir,
    },
    default: {
      ...actualDefault,
      promises: {
        ...actual.promises,
        mkdir: mockMkdir,
      },
    },
  };
});
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider;
  let mockContext: DeploymentContext;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new CloudflareProvider();
    mockContext = {
      cwd: '/mock',
      options: {},
      config: {
        deploy: {
          apps: {
            frontend: {
              provider: 'cloudflare',
              projectName: 'my-app',
            },
          },
        },
      } as unknown as DeploymentContext['config'],
    };
    (execAsync as Mock).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
    (spawnAsync as Mock).mockResolvedValue(undefined);
    (fs.promises.mkdir as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  describe('provision', () => {
    it('should error if project name is missing', async () => {
      const app = { name: 'frontend', provider: 'cloudflare' } as AppConfig;
      await expect(provider.provision(mockContext, app)).rejects.toThrow(
        'Cloudflare project name not found',
      );
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(spawnAsync).not.toHaveBeenCalled();
    });

    it('should skip if credentials missing', async () => {
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('credentials missing'));
      expect(spawnAsync).not.toHaveBeenCalled();
    });

    it('should provision successfully using default env vars', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // Project check - project does NOT exist
      mockFetch.mockResolvedValueOnce({ ok: false });

      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await provider.provision(mockContext, app);

      expect(spawnAsync).toHaveBeenCalledWith(
        'wrangler',
        expect.arrayContaining(['pages', 'project', 'create', 'my-app']),
        expect.anything(),
      );
      vi.unstubAllGlobals();
    });

    it('should swallow "project already exists" error', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // Project check - project does NOT exist (simulated race condition where it's created between check and create)
      mockFetch.mockResolvedValueOnce({ ok: false });

      (spawnAsync as Mock).mockRejectedValueOnce(
        new Error('A pages project with this name already exists.'),
      );
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await provider.provision(mockContext, app);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cloudflare project already exists'),
      );
      vi.unstubAllGlobals();
    });

    it('should rethrow critical provisioning errors', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // Project check - project does NOT exist
      mockFetch.mockResolvedValueOnce({ ok: false });

      (spawnAsync as Mock).mockRejectedValueOnce(new Error('Critical error'));
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await expect(provider.provision(mockContext, app)).rejects.toThrow('Critical error');
      vi.unstubAllGlobals();
    });

    it('should link custom domains during provision', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // First call (GET project) - project exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Second call (GET domains) - return one existing domain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'already-linked.com' }],
        }),
      });

      // Third call (POST domain) - link new-domain.com
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: { name: 'new-domain.com' },
        }),
      });

      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'my-app',
        domain: ['already-linked.com', 'new-domain.com'],
      } as AppConfig;

      await provider.provision(mockContext, app);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/pages/projects/my-app'),
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        3,
        expect.stringContaining('/pages/projects/my-app/domains'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'new-domain.com' }),
        }),
      );
      expect(logger.success).toHaveBeenCalledWith(
        expect.stringContaining('Linked domain new-domain.com'),
      );

      vi.unstubAllGlobals();
    });

    it('should suppress "already added" error during domain linking', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // First call (GET project) - project exists
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Second call (GET domains) - return empty existing domains
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [],
        }),
      });

      // Third call (POST domain) - return "already added" error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () =>
          JSON.stringify({
            success: false,
            errors: [{ code: 8000018, message: 'You have already added this custom domain.' }],
          }),
      });

      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'my-app',
        domain: ['existing.com'],
      } as AppConfig;

      await provider.provision(mockContext, app);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Domain existing.com already linked'),
      );
      expect(logger.warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Failed to link domain'),
      );

      vi.unstubAllGlobals();
    });
  });

  describe('getSecrets', () => {
    it('should return default secrets', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      const secrets = await provider.getSecrets(mockContext, app);
      expect(secrets['CLOUDFLARE_API_TOKEN']).toBe('tok');
      expect(secrets['CLOUDFLARE_ACCOUNT_ID']).toBe('acc');
    });
  });

  describe('getVariables', () => {
    it('should return project variable', async () => {
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      const vars = await provider.getVariables(mockContext, app);
      expect(vars['CLOUDFLARE_PROJECT_NAME_FRONTEND']).toBe('my-app');
    });
  });

  describe('deploy', () => {
    it('should run wrangler deploy', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await provider.deploy(mockContext, app);

      expect(spawnAsync).toHaveBeenCalledWith(
        'wrangler',
        expect.arrayContaining(['pages', 'deploy', 'dist', '--project-name=my-app']),
        expect.anything(),
      );
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      await provider.deploy(mockContext, app);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(spawnAsync).not.toHaveBeenCalled();
    });
  });
});
