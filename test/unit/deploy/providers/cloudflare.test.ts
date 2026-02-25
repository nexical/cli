import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { CloudflareProvider } from '../../../../src/deploy/providers/cloudflare.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import { DeploymentContext, AppConfig } from '../../../../src/deploy/types.js';

vi.mock('../../../../src/deploy/utils.js');
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
      } as any,
    };
    (execAsync as Mock).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
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
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should skip if credentials missing', async () => {
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('credentials missing'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should provision successfully using default env vars', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await provider.provision(mockContext, app);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('wrangler pages project create my-app --production-branch main'),
        expect.anything(),
      );
    });

    it('should swallow "project already exists" error', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      (execAsync as Mock).mockRejectedValueOnce(
        new Error('A pages project with this name already exists.'),
      );
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await provider.provision(mockContext, app);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cloudflare project already exists'),
      );
    });

    it('should rethrow critical provisioning errors', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      (execAsync as Mock).mockRejectedValueOnce(new Error('Critical error'));
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;

      await expect(provider.provision(mockContext, app)).rejects.toThrow('Critical error');
    });

    it('should link custom domains during provision', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      // First call (GET) - return one existing domain
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ domain: 'already-linked.com' }],
        }),
      });

      // Second call (POST) - link new-domain.com
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

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/pages/projects/my-app/domains'),
        expect.anything(),
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
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

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('wrangler pages deploy dist --project-name=my-app'),
        expect.anything(),
      );
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      await provider.deploy(mockContext, app);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });
  });
});
