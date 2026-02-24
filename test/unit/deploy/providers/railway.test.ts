import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RailwayProvider } from '../../../../src/deploy/providers/railway.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';

vi.mock('../../../../src/deploy/utils.js');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('RailwayProvider', () => {
  let provider: RailwayProvider;
  let mockContext: { cwd: string; options: Record<string, unknown>; config: any };

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new RailwayProvider();
    mockContext = {
      cwd: '/mock',
      options: {}, // Env undefined by default
      config: { deploy: { backend: { projectName: 'my-proj' } } },
    };
    (execAsync as unknown as { mockResolvedValue: any }).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.RAILWAY_API_TOKEN;
    delete process.env.RAILWAY_TOKEN;
    delete process.env.CUSTOM_RW_TOKEN;
  });

  describe('provision', () => {
    it('should default to production environment if options.env is missing', async () => {
      // mockContext.options.env is undefined
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'Linked',
      }); // status
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      }); // postgres check

      await provider.provision(mockContext);

      // Should stick to baseProjectName 'my-proj'
      expect(execAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('my-proj-production'),
        expect.anything(),
      );
    });

    it('should error if project name missing', async () => {
      mockContext.config.deploy.backend.projectName = undefined;
      await expect(provider.provision(mockContext)).rejects.toThrow(
        'Railway project name not found',
      );
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.provision(mockContext);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should handle deleted project', async () => {
      // Use real Error to trigger 'instanceof Error' branch
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project is deleted' }),
      );
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'Linked',
      }); // init
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      }); // postgres check

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith('railway unlink', expect.anything());
    });

    it('should handle unlink failure (deleted project)', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project is deleted' }),
      );
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        new Error('Unlink failed'),
      ); // unlink fail
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'Linked',
      }); // init
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      }); // postgres check

      await provider.provision(mockContext);
      // Should proceed to init despite unlink fail
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway init'),
        expect.anything(),
      );
    });

    it('should check status and init if not linked', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project not found' }),
      );
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'Linked',
      });
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      });

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway init --name my-proj'),
        expect.anything(),
      );
    });

    it('should throw on auth failure', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Unauthorized' }),
      );

      await expect(provider.provision(mockContext)).rejects.toThrow(
        'Railway authentication failed',
      );
    });

    it('should warn on generic status failure with Error object', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        new Error('Timeout'),
      ); // generic
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      }); // postgres check pass

      await provider.provision(mockContext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Railway status check failed'),
      );
    });

    it('should warn on generic status failure with string error', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        'Timeout String',
      );
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'postgres',
      });

      await provider.provision(mockContext);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Railway status check failed: Timeout String'),
      );
    });

    it('should add postgres if missing', async () => {
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'ok',
      }); // status ok
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'empty',
      }); // postgres missing
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'db added',
      }); // add db

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway add --database postgres'),
        expect.anything(),
      );
    });

    it('should handle second status check failure (swallow error)', async () => {
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'ok',
      }); // status ok
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        new Error('Status2 fail'),
      ); // status2 fail -> catch -> { stdout: '' }
      // If stdout is empty, it proceeds to add postgres?
      // Line 78: if (!status.includes('postgres')) -> '' doesn't include it -> true.
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'db added',
      }); // add db

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway add --database postgres'),
        expect.anything(),
      );
    });

    it('should handle postgres status check failure (explicit throw in add logic check)', async () => {
      // This tests the logic flow, but "Status2 fail" catch block return value triggers "add"
      // My previous test above covers the catch block.
    });

    it('should warn if auto-add postgres fails', async () => {
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'ok',
      }); // status ok
      (execAsync as unknown as { mockResolvedValueOnce: any }).mockResolvedValueOnce({
        stdout: 'empty',
      }); // postgres missing
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        new Error('Add failed'),
      ); // add db fail

      await provider.provision(mockContext);

      expect(logger.warn).toHaveBeenCalledWith('Failed to auto-add PostgreSQL.');
    });

    it('should log generic setup failures', async () => {
      const err = new Error('Generic failure') as any;
      err.stderr = 'some stderr';
      err.stdout = 'some stdout';

      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project not found' }),
      );
      (execAsync as any).mockRejectedValueOnce(err);

      await provider.provision(mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Railway setup failed with error: Generic failure'),
      );
    });

    it('should handle setup failure with empty output', async () => {
      const errEmpty = new Error('Empty fail') as any;
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project not found' }),
      );
      (execAsync as any).mockRejectedValueOnce(errEmpty);

      await provider.provision(mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Railway setup failed with error: Empty fail'),
      );
    });

    it('should handle non-Error exceptions in outer catch', async () => {
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project not found' }),
      );
      (execAsync as any).mockRejectedValueOnce('String setup error');

      await provider.provision(mockContext);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Railway setup failed with error: String setup error'),
      );
    });

    it('should handle non-production environment', async () => {
      mockContext.options.env = 'staging';
      (execAsync as unknown as { mockRejectedValueOnce: any }).mockRejectedValueOnce(
        Object.assign(new Error('Error'), { stderr: 'Project not found' }),
      );

      await provider.provision(mockContext);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway init --name my-proj-staging'),
        expect.anything(),
      );
    });
  });

  describe('getSecrets', () => {
    it('should resolve token from env', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      const secrets = await provider.getSecrets(mockContext);
      expect(secrets['RAILWAY_API_TOKEN']).toBe('tok');
      delete process.env.RAILWAY_API_TOKEN;
    });

    it('should resolve token from configured env var', async () => {
      mockContext.config.deploy.backend.options = { tokenEnvVar: 'CUSTOM_RW_TOKEN' };
      process.env.CUSTOM_RW_TOKEN = 'custom-rw-tok';

      const secrets = await provider.getSecrets(mockContext);
      expect(secrets['RAILWAY_API_TOKEN']).toBe('custom-rw-tok');

      delete process.env.CUSTOM_RW_TOKEN;
    });

    it('should error if token missing', async () => {
      delete process.env.RAILWAY_API_TOKEN;
      delete process.env.RAILWAY_TOKEN;
      await expect(provider.getSecrets(mockContext)).rejects.toThrow('Railway Token not found');
    });
  });

  describe('getVariables', () => {
    it('should return project name', async () => {
      expect(await provider.getVariables(mockContext)).toEqual({
        RAILWAY_PROJECT_NAME: 'my-proj',
      });
    });
  });

  describe('getCIConfig', () => {
    it('should return config', () => {
      expect(provider.getCIConfig()).toHaveProperty('deploySteps');
    });
  });
});
