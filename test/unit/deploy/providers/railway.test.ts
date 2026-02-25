import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RailwayProvider } from '../../../../src/deploy/providers/railway.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import { DeploymentContext, AppConfig } from '../../../../src/deploy/types.js';

vi.mock('../../../../src/deploy/utils.js');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}));

describe('RailwayProvider', () => {
  let provider: RailwayProvider;
  let mockContext: DeploymentContext;
  let mockApp: AppConfig;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new RailwayProvider();
    mockContext = {
      cwd: '/mock',
      options: {},
      config: { deploy: { repository: { provider: 'github' }, apps: {} } },
    } as unknown as DeploymentContext;
    mockApp = {
      name: 'backend',
      provider: 'railway',
      projectName: 'my-proj',
      target: 'apps/backend',
    };
    (execAsync as Mock).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.RAILWAY_API_TOKEN;
    delete process.env.RAILWAY_TOKEN;
  });

  describe('provision', () => {
    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.provision(mockContext, mockApp);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should provision successfully', async () => {
      process.env.RAILWAY_TOKEN = 'tok';
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'ok' }); // status

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway status'),
        expect.anything(),
      );
    });

    it('should warn if auto-add service fails', async () => {
      process.env.RAILWAY_TOKEN = 'tok';
      mockApp.railway = {
        services: [{ type: 'database', name: 'postgres' }],
      };

      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'ok' }); // status
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'empty' }); // list
      (execAsync as Mock).mockRejectedValueOnce(new Error('Add failed')); // add

      await provider.provision(mockContext, mockApp);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-add postgres database'),
      );
    });
  });

  describe('getSecrets', () => {
    it('should resolve secrets', async () => {
      process.env.RAILWAY_TOKEN = 'tok';
      mockApp.secrets = { KEY: 'SOME_ENV' };
      process.env.SOME_ENV = 'VALUE';

      const secrets = await provider.getSecrets(mockContext, mockApp);
      expect(secrets['RAILWAY_API_TOKEN']).toBe('tok');
      expect(secrets['KEY']).toBe('VALUE');

      delete process.env.SOME_ENV;
    });
  });

  describe('getVariables', () => {
    it('should return project and environment variables', async () => {
      const vars = await provider.getVariables(mockContext, mockApp);
      expect(vars['RAILWAY_PROJECT_NAME']).toBe('my-proj');
      expect(vars['RAILWAY_ENVIRONMENT']).toBe('production');
    });
  });

  describe('deploy', () => {
    it('should run railway up', async () => {
      process.env.RAILWAY_TOKEN = 'tok';
      await provider.deploy(mockContext, mockApp);
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway up'),
        expect.anything(),
      );
    });
  });
});
