import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CloudflareProvider } from '../../../../src/deploy/providers/cloudflare.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';

vi.mock('../../../../src/deploy/utils.js');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CloudflareProvider', () => {
  let provider: CloudflareProvider;
  let mockContext: { cwd: string; options: Record<string, unknown>; config: any };

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new CloudflareProvider();
    mockContext = {
      cwd: '/mock',
      options: {}, // Env undefined by default to test 'production' fallback
      config: {
        deploy: {
          frontend: {
            projectName: 'my-app',
            // options intentionally undefined here to test fallback
          },
        },
      },
    };
    (execAsync as unknown as { mockResolvedValue: any }).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CUSTOM_CF_TOKEN;
    delete process.env.CUSTOM_CF_ACC;
  });

  describe('provision', () => {
    it('should error if project name is missing', async () => {
      mockContext.config.deploy.frontend.projectName = undefined;
      await expect(provider.provision(mockContext)).rejects.toThrow(
        'Cloudflare project name not found',
      );
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.provision(mockContext);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should skip if credentials missing', async () => {
      // No env vars set
      await provider.provision(mockContext);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('credentials missing'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should provision successfully using default env vars', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('wrangler pages project create my-app --production-branch main'),
        expect.anything(),
      );
    });

    it('should swallow "project already exists" error', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        new Error('Already exists'),
      );

      await provider.provision(mockContext);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Cloudflare project might already exist'),
      );
    });

    it('should rethrow critical provisioning errors', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      (logger.info as unknown as { mockImplementationOnce: any }).mockImplementationOnce(() => {}); // Config...
      (logger.info as unknown as { mockImplementationOnce: any }).mockImplementationOnce(() => {
        throw new Error('Critical');
      }); // Ensuring...

      await expect(provider.provision(mockContext)).rejects.toThrow('Critical');
      expect(logger.warn).toHaveBeenCalledWith('Cloudflare setup failed.');
    });

    it('should handle non-production environment', async () => {
      mockContext.options.env = 'staging';
      mockContext.config.deploy.frontend.options = {}; // Ensure options exist
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('wrangler pages project create my-app-staging'),
        expect.anything(),
      );
    });

    it('should use configured env vars for credentials', async () => {
      mockContext.config.deploy.frontend.options = {
        apiTokenEnvVar: 'CUSTOM_CF_TOKEN',
        accountIdEnvVar: 'CUSTOM_CF_ACC',
      };
      process.env.CUSTOM_CF_TOKEN = 'custom-tok';
      process.env.CUSTOM_CF_ACC = 'custom-acc';

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          env: expect.objectContaining({
            CLOUDFLARE_API_TOKEN: 'custom-tok',
            CLOUDFLARE_ACCOUNT_ID: 'custom-acc',
          }),
        }),
      );
    });
  });

  describe('getSecrets', () => {
    it('should resolve secrets from default env vars', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      // options undefined by default in beforeEach
      const secrets = await provider.getSecrets(mockContext);
      expect(secrets['CLOUDFLARE_API_TOKEN']).toBe('tok');
      expect(secrets['CLOUDFLARE_ACCOUNT_ID']).toBe('acc');
    });

    it('should resolve secrets from configured env vars', async () => {
      mockContext.config.deploy.frontend.options = {
        apiTokenEnvVar: 'CUSTOM_CF_TOKEN',
        accountIdEnvVar: 'CUSTOM_CF_ACC',
      };
      process.env.CUSTOM_CF_TOKEN = 'custom-tok';
      process.env.CUSTOM_CF_ACC = 'custom-acc';

      const secrets = await provider.getSecrets(mockContext);
      expect(secrets['CLOUDFLARE_API_TOKEN']).toBe('custom-tok');
      expect(secrets['CLOUDFLARE_ACCOUNT_ID']).toBe('custom-acc');
    });

    it('should error if API Token missing', async () => {
      // No env vars
      await expect(provider.getSecrets(mockContext)).rejects.toThrow(
        'Cloudflare API Token not found',
      );
    });

    it('should error if Account ID missing', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      // No account ID
      await expect(provider.getSecrets(mockContext)).rejects.toThrow(
        'Cloudflare Account ID not found',
      );
    });
  });

  describe('getVariables', () => {
    it('should return project name for production', async () => {
      const vars = await provider.getVariables(mockContext);
      expect(vars['CLOUDFLARE_PROJECT_NAME']).toBe('my-app');
    });

    it('should return project name for staging', async () => {
      mockContext.options.env = 'staging';
      const vars = await provider.getVariables(mockContext);
      expect(vars['CLOUDFLARE_PROJECT_NAME']).toBe('my-app-staging');
    });

    it('should error if project name missing', async () => {
      mockContext.config.deploy.frontend.projectName = undefined;
      await expect(provider.getVariables(mockContext)).rejects.toThrow(
        'Cloudflare project name not found',
      );
    });
  });

  describe('getCIConfig', () => {
    it('should return config', () => {
      const config = provider.getCIConfig();
      expect(config.githubActionStep?.uses).toBe('cloudflare/wrangler-action@v3');
    });
  });
});
