import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RailwayProvider } from '../../../../src/deploy/providers/railway.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import { DeploymentContext, AppConfig } from '../../../../src/deploy/types.js';

interface EnsureDomainsLinkedOptions {
  targetDir: string;
  processEnv: NodeJS.ProcessEnv;
  phase: 'provision' | 'deploy';
  serviceId: string;
  environment: string;
}

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
  });

  describe('provision', () => {
    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.provision(mockContext, mockApp);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should provision successfully and add service if missing', async () => {
      mockApp.buildCommand = 'npm run build';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const emptyStatus = JSON.stringify({ services: { edges: [] } });
      const addedStatus = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      }); // list projects
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link project by id
      (execAsync as Mock).mockResolvedValueOnce({ stdout: emptyStatus }); // getStatusData (initial)
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'added' }); // add service
      (execAsync as Mock).mockResolvedValueOnce({ stdout: addedStatus }); // getStatusData (post-add)
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link service

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway list --json'),
        expect.anything(),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway link --project proj-1 --environment "production"'),
        expect.anything(),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway add --service backend'),
        expect.anything(),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway service link srv-1'),
        expect.anything(),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway variable set --service srv-1 RAILPACK_BUILD_CMD'),
        expect.anything(),
      );
    });

    it('should warn if auto-add service fails', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      mockApp.railway = {
        services: [{ type: 'database', name: 'postgres' }],
      };
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      }); // list projects
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link project
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend }); // getStatusData (initial)
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link backend
      (execAsync as Mock).mockRejectedValueOnce(new Error('Add failed')); // add database

      await provider.provision(mockContext, mockApp);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to auto-add postgres database'),
      );
    });

    it('should link domains', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      }); // list
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link proj
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend }); // getStatusData
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link srv
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'domain-linked' }); // domain link

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway domain --service srv-1 api.nexical.ai'),
        expect.anything(),
      );
    });

    it('should handle provision failure and log errors', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      (execAsync as Mock)
        .mockResolvedValueOnce({ stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]) }) // list
        .mockRejectedValueOnce(new Error('Link fail')); // link project

      await provider.provision(mockContext, mockApp);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Railway setup failed'));
    });

    it('should throw if authentication fails during project list', async () => {
      process.env.RAILWAY_API_TOKEN = 'wrong';
      (execAsync as Mock).mockRejectedValueOnce({ stderr: 'Unauthorized' });

      await expect(provider.provision(mockContext, mockApp)).rejects.toThrow(
        'Railway authentication failed',
      );
    });

    it('should handle deferred domain linking when service not found', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const emptyStatus = JSON.stringify({ services: { edges: [] } });

      // 1. List projects
      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      });
      // 2. Link proj
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });
      // 3. Initial getStatusData - NO backend
      (execAsync as Mock).mockResolvedValueOnce({ stdout: emptyStatus });
      // 4. Add service backend
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'added' });
      // 5. Update getStatusData - STILL NO backend (mocking failure)
      (execAsync as Mock).mockResolvedValueOnce({ stdout: emptyStatus });
      // 6. Link service backend (by name since ID not found)
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });
      // 7. Domain link fails with "ServiceInstance not found"
      (execAsync as Mock).mockRejectedValueOnce({ stderr: 'ServiceInstance not found' });

      await provider.provision(mockContext, mockApp);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('deferred until deployment'),
      );
    });

    it('should handle multiple domains', async () => {
      mockApp.domain = ['api.nexical.ai', 'api-v2.nexical.ai'];
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      }); // list
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link proj
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend }); // getStatusData
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link srv
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'domain-linked' }); // domain 1
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'domain-linked' }); // domain 2

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway domain --service srv-1 api.nexical.ai'),
        expect.anything(),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway domain --service srv-1 api-v2.nexical.ai'),
        expect.anything(),
      );
    });

    it('should ignore already linked domains', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      // Mock status
      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      }); // list
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link project
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend }); // getStatusData
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' }); // link srv-1
      // Mock link failure with "already exists"
      (execAsync as Mock).mockRejectedValueOnce({ stderr: 'Domain already exists' });

      await provider.provision(mockContext, mockApp);

      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Domain api.nexical.ai already linked'),
      );
    });

    it('should link if not linked but project exists', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      // 1. List projects finds it
      (execAsync as Mock).mockResolvedValueOnce({
        stdout: JSON.stringify([{ name: 'my-proj', id: 'proj-1' }]),
      });
      // 2. Link by ID succeeds
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });
      // 3. getStatusData
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend });
      // 4. link service
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway link --project proj-1 --environment "production"'),
        expect.anything(),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found existing project "my-proj" (proj-1)'),
      );
    });

    it('should init if project does not exist', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      // 1. List projects returns empty
      (execAsync as Mock).mockResolvedValueOnce({ stdout: '[]' });
      // 2. Status check fails (not linked)
      (execAsync as Mock).mockRejectedValueOnce({ stderr: 'Not linked' });
      // 3. Init succeeds
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'initialized' });
      // 4. getStatusData
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend });
      // 5. link service
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });

      await provider.provision(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway init --name my-proj'),
        expect.anything(),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Project "my-proj" not found. Initializing'),
      );
    });

    it('should retry domain linking if service instance not found', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        id: 'proj-1',
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });

      // 1. status --json
      (execAsync as Mock).mockResolvedValueOnce({ stdout: statusWithBackend });
      // 2. railway up
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'deployed' });
      // 3. Domain link Attempt 1 -> Fail
      (execAsync as Mock).mockRejectedValueOnce({ stderr: 'ServiceInstance not found' });
      // 4. Domain link Attempt 2 -> Success
      (execAsync as Mock).mockResolvedValueOnce({ stdout: 'linked' });

      // Faster retries for tests
      vi.useFakeTimers();
      const deployPromise = provider.deploy(mockContext, mockApp);

      // Allow the first attempt to fail and set the timer
      await vi.runAllTimersAsync();
      await deployPromise;
      vi.useRealTimers();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Retrying mapping in 3s... (Attempt 1/5)'),
      );
      expect(execAsync).toHaveBeenCalledTimes(4);
      expect(execAsync).toHaveBeenLastCalledWith(
        expect.stringContaining('railway domain --service srv-1 api.nexical.ai'),
        expect.anything(),
      );
    });

    it('should re-throw status error if not a "not linked" error', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      (execAsync as Mock).mockResolvedValueOnce({ stdout: '[]' }); // list
      (execAsync as Mock).mockRejectedValueOnce(new Error('Fatal status error')); // status check returns unknown error

      await provider.provision(mockContext, mockApp);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Fatal status error'));
    });

    it('should warn if linking directory to service fails', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        services: { edges: [{ node: { name: 'backend', id: 'srv-1' } }] },
      });
      (execAsync as Mock)
        .mockResolvedValueOnce({ stdout: JSON.stringify([{ name: 'my-proj', id: 'p1' }]) }) // list
        .mockResolvedValueOnce({ stdout: 'linked' }) // link proj
        .mockResolvedValueOnce({ stdout: statusWithBackend }) // status
        .mockRejectedValueOnce(new Error('Link fail')); // link service

      await provider.provision(mockContext, mockApp);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to link service srv-1: Link fail'),
      );
    });

    it('should warn if setting build/start commands fails', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      mockApp.buildCommand = 'build';
      mockApp.startCommand = 'start';
      const statusWithBackend = JSON.stringify({
        services: { edges: [{ node: { name: 'backend', id: 'srv-1' } }] },
      });
      (execAsync as Mock)
        .mockResolvedValueOnce({ stdout: JSON.stringify([{ name: 'my-proj', id: 'p1' }]) }) // list
        .mockResolvedValueOnce({ stdout: 'linked' }) // link proj
        .mockResolvedValueOnce({ stdout: statusWithBackend }) // status
        .mockResolvedValueOnce({ stdout: 'linked' }) // link service
        .mockRejectedValueOnce(new Error('Var fail')) // set build cmd
        .mockRejectedValueOnce(new Error('Var fail')); // set start cmd

      await provider.provision(mockContext, mockApp);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set RAILPACK_BUILD_CMD: Var fail'),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to set RAILPACK_START_CMD: Var fail'),
      );
    });

    it('should warn for unsupported service types', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      mockApp.railway = { services: [{ type: 'redis', name: 'my-redis' }] };
      const statusWithBackend = JSON.stringify({
        services: { edges: [{ node: { name: 'backend', id: 'srv-1' } }] },
      });
      (execAsync as Mock)
        .mockResolvedValueOnce({ stdout: JSON.stringify([{ name: 'my-proj', id: 'p1' }]) }) // list
        .mockResolvedValueOnce({ stdout: 'linked' }) // link proj
        .mockResolvedValueOnce({ stdout: statusWithBackend }) // status
        .mockResolvedValueOnce({ stdout: 'linked' }); // link service

      await provider.provision(mockContext, mockApp);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Service type "redis" is not yet supported'),
      );
    });
  });

  describe('getSecrets', () => {
    it('should resolve secrets', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      mockApp.secrets = { KEY: 'SOME_ENV' };
      process.env.SOME_ENV = 'VALUE';

      const secrets = await provider.getSecrets(mockContext, mockApp);
      expect(secrets['RAILWAY_API_TOKEN']).toBe('tok');
      expect(secrets['KEY']).toBe('VALUE');

      delete process.env.SOME_ENV;
    });

    it('should throw if token missing', async () => {
      await expect(provider.getSecrets(mockContext, mockApp)).rejects.toThrow(
        'Railway Token not found',
      );
    });

    it('should use custom token env var', async () => {
      mockApp.railway = { token: 'CUSTOM_TOK_VAR' };
      process.env.CUSTOM_TOK_VAR = 'tok-val';
      const secrets = await provider.getSecrets(mockContext, mockApp);
      expect(secrets['RAILWAY_API_TOKEN']).toBe('tok-val');
      delete process.env.CUSTOM_TOK_VAR;
    });
  });

  describe('getVariables', () => {
    it('should return project and environment variables', async () => {
      const vars = await provider.getVariables(mockContext, mockApp);
      expect(vars['RAILWAY_PROJECT_NAME']).toBe('my-proj');
      expect(vars['RAILWAY_ENVIRONMENT']).toBe('production');
    });

    it('should throw on missing projectName in getVariables', async () => {
      mockApp.projectName = undefined;
      await expect(provider.getVariables(mockContext, mockApp)).rejects.toThrow(
        'Railway project name not found',
      );
    });

    it('should handle custom env variables', async () => {
      mockApp.env = { MY_VAR: 'SOME_VALUE', MY_ENV: 'ENV_VAR' };
      process.env.ENV_VAR = 'resolved';
      const vars = await provider.getVariables(mockContext, mockApp);
      expect(vars['MY_VAR']).toBe('SOME_VALUE');
      expect(vars['MY_ENV']).toBe('resolved');
      delete process.env.ENV_VAR;
    });
  });

  describe('getCIConfig', () => {
    it('should return CI config', () => {
      const ci = provider.getCIConfig('github', mockApp);
      expect(ci.secrets).toContain('RAILWAY_API_TOKEN');
      expect(ci.deploySteps?.[0]).toContain('railway up');
    });
  });

  describe('getDefaultDnsTarget', () => {
    it('should return default DNS target', () => {
      expect(provider.getDefaultDnsTarget(mockApp)).toBe('my-proj.up.railway.app');
      mockApp.projectName = undefined;
      expect(provider.getDefaultDnsTarget(mockApp)).toBeUndefined();
    });
  });

  describe('deploy', () => {
    it('should run railway up with explicit IDs and link domains', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      const statusWithBackend = JSON.stringify({
        id: 'proj-1',
        services: {
          edges: [{ node: { name: 'backend', id: 'srv-1' } }],
        },
      });
      (execAsync as Mock).mockResolvedValue({ stdout: statusWithBackend });

      await provider.deploy(mockContext, mockApp);

      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway status --json'),
        expect.objectContaining({
          cwd: expect.stringContaining('apps/backend'),
        }),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining(
          'railway up --detach --project proj-1 --service srv-1 --environment "production"',
        ),
        expect.objectContaining({
          cwd: '/mock', // Should be root
        }),
      );
      expect(execAsync).toHaveBeenCalledWith(
        expect.stringContaining('railway domain --service srv-1 api.nexical.ai'),
        expect.objectContaining({
          cwd: expect.stringContaining('apps/backend'),
        }),
      );
    });

    it('should handle dry run during deploy', async () => {
      mockContext.options.dryRun = true;
      const statusWithBackend = JSON.stringify({
        id: 'proj-1',
        services: { edges: [{ node: { name: 'backend', id: 'srv-1' } }] },
      });
      (execAsync as Mock).mockResolvedValue({ stdout: statusWithBackend });

      await provider.deploy(mockContext, mockApp);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Dry Run] Would run: railway up'),
      );
      expect(execAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('railway up'),
        expect.anything(),
      );
    });

    it('should handle dry run during domain linking', async () => {
      mockApp.domain = 'api.nexical.ai';
      mockContext.options.dryRun = true;

      await (
        provider as unknown as {
          ensureDomainsLinked: (
            ctx: DeploymentContext,
            app: AppConfig,
            options: EnsureDomainsLinkedOptions,
          ) => Promise<void>;
        }
      ).ensureDomainsLinked(mockContext, mockApp, {
        targetDir: '/mock',
        processEnv: {},
        phase: 'deploy',
        serviceId: 's1',
        environment: 'production',
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Dry Run] Would link domain api.nexical.ai'),
      );
      expect(execAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('railway domain'),
        expect.anything(),
      );
    });

    it('should warn if domain linking fails with unknown error', async () => {
      mockApp.domain = 'api.nexical.ai';
      (execAsync as Mock)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            id: 'p1',
            services: { edges: [{ node: { id: 's1', name: 'backend' } }] },
          }),
        }) // status
        .mockResolvedValueOnce({ stdout: 'up' }) // up
        .mockRejectedValueOnce(new Error('Unknown domain error')); // link domain

      await provider.deploy(mockContext, mockApp);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to link domain api.nexical.ai: Unknown domain error'),
      );
    });

    it('should log error if projectId is missing', async () => {
      process.env.RAILWAY_API_TOKEN = 'tok';
      (execAsync as Mock).mockResolvedValue({ stdout: '{}' });
      await provider.deploy(mockContext, mockApp);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('No linked Railway project found'),
      );
    });

    it('should handle domain already linked during deploy', async () => {
      mockApp.domain = 'api.nexical.ai';
      process.env.RAILWAY_API_TOKEN = 'tok';
      (execAsync as Mock)
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            id: 'p1',
            services: { edges: [{ node: { id: 's1', name: 'backend' } }] },
          }),
        }) // status
        .mockResolvedValueOnce({ stdout: 'up' }) // up
        .mockRejectedValueOnce({ stderr: 'already exists' }); // domain link

      await provider.deploy(mockContext, mockApp);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('already linked'));
    });

    it('should handle non-Error objects in deploy catch', async () => {
      const localApp = { ...mockApp, projectName: 'p1' };
      (execAsync as Mock)
        .mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'p1' }) }) // status
        .mockRejectedValueOnce('Deploy Fail String'); // actual deploy up

      await provider.deploy(mockContext, localApp);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Deploy Fail String'));
    });
    it('should log stderr in deploy failure if present', async () => {
      vi.stubEnv('RAILWAY_API_TOKEN', 'tok');

      vi.mocked(execAsync).mockImplementation((async (cmd: string) => {
        if (cmd.includes('railway status'))
          return {
            stdout: JSON.stringify({
              id: 'p1',
              services: { edges: [{ node: { id: 's1', name: 'backend' } }] },
            }),
            stderr: '',
          };
        if (cmd.includes('railway up')) {
          const err = new Error('Deploy Fail');
          (err as unknown as { stderr: string }).stderr = 'Internal Railway Error';
          throw err;
        }
        return { stdout: '', stderr: '' };
      }) as unknown as never);

      const app = { name: 'backend', provider: 'railway', projectName: 'my-proj' } as AppConfig;
      await provider.deploy(mockContext, app);
      expect(logger.error).toHaveBeenCalled();
      vi.unstubAllEnvs();
    });

    it('should handle non-Error objects in ensureDomainsLinked catch', async () => {
      (execAsync as Mock).mockRejectedValueOnce('Domain Fail String');
      await (
        provider as unknown as {
          ensureDomainsLinked: (
            ctx: DeploymentContext,
            app: AppConfig,
            options: EnsureDomainsLinkedOptions,
          ) => Promise<void>;
        }
      ).ensureDomainsLinked(mockContext, mockApp, {
        targetDir: '/mock',
        processEnv: {},
        phase: 'deploy',
        serviceId: 's1',
        environment: 'prod',
      });
      expect(logger.warn).toHaveBeenCalled();
    });

    it.skip('should handle "No services found" error in provision', async () => {
      vi.mocked(execAsync).mockImplementation((async (cmd: string) => {
        if (cmd.includes('railway status')) throw new Error('No services found');
        return { stdout: '', stderr: '' };
      }) as unknown as never);
      await provider.provision(mockContext, mockApp);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('no services found'));
    });
  });

  it('should handle unauthorized error during project listing in provision', async () => {
    vi.mocked(execAsync).mockRejectedValue({ stderr: 'unauthorized' });
    const app = { name: 'app1', provider: 'railway', projectName: 'p' };

    await expect(
      provider.provision({ options: {} } as unknown as never, app as unknown as never),
    ).rejects.toThrow('Railway authentication failed while listing projects');
  });

  it('should handle exhausted retries for domain linking', async () => {
    vi.useFakeTimers();
    vi.stubEnv('RAILWAY_API_TOKEN', 'tok');
    const app = { name: 'app1', domain: 'ex.com', provider: 'railway', projectName: 'p' };

    // Mock sequence:
    // 1. list (once)
    // 2. link (once)
    // 3. status (initial in deploy)
    // 4. railway up (once)
    // 5-9. status (in retry loop)
    // 10. domain link (exhausted retries)
    const statusDataLocal = {
      id: 'p1',
      services: { edges: [{ node: { id: 's1', name: 'app1' } }] },
    };
    (execAsync as Mock).mockImplementation((async (cmd: string) => {
      if (cmd.includes('railway status'))
        return { stdout: JSON.stringify(statusDataLocal), stderr: '' };
      if (cmd.includes('railway up')) return { stdout: 'up', stderr: '' };
      if (cmd.includes('railway domain')) throw { stderr: 'serviceinstance not found' };
      if (cmd.includes('railway list'))
        return { stdout: JSON.stringify([{ name: 'p', id: 'p1' }]), stderr: '' };
      if (cmd.includes('railway link')) return { stdout: 'linked', stderr: '' };
      return { stdout: '', stderr: '' };
    }) as unknown as never);

    const localProvider = new RailwayProvider();
    const deployPromise = localProvider.deploy(mockContext, app as unknown as never);

    // Fast forward through retries
    for (let i = 0; i < 6; i++) {
      await vi.runAllTimersAsync();
    }

    await deployPromise;

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('still not found after 5 attempts'),
    );
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('should handle exhausted retries for domain linking during deploy', async () => {
    process.env.RAILWAY_API_TOKEN = 'tok';
    vi.useFakeTimers();
    vi.mocked(execAsync)
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          id: 'p1',
          services: { edges: [{ node: { id: 's1', name: 'backend' } }] },
        }),
        stderr: '',
      }) // status
      .mockResolvedValueOnce({ stdout: 'up', stderr: '' }) // up
      .mockRejectedValue({ stderr: 'serviceinstance not found' }); // domain link retries

    mockApp.domain = 'api.nexical.ai';
    const deployPromise = provider.deploy(mockContext, mockApp);

    // Fast forward through retries
    for (let i = 0; i < 6; i++) {
      await vi.runAllTimersAsync();
    }

    await deployPromise;

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('still not found after 5 attempts'),
    );
    vi.useRealTimers();
  });

  it('should fail if custom secret env var is missing', async () => {
    process.env.RAILWAY_API_TOKEN = 'tok';
    const app = {
      name: 'app1',
      provider: 'railway',
      secrets: { MY_SECRET: 'MISSING_ENV_VAR' },
    };

    delete process.env.MISSING_ENV_VAR;

    await expect(
      provider.getSecrets({ options: {} } as unknown as never, app as unknown as never),
    ).rejects.toThrow(
      "Custom secret 'MY_SECRET' mapping failed: Env var 'MISSING_ENV_VAR' not found.",
    );
  });
});
