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
  });

  describe('getVariables', () => {
    it('should return project and environment variables', async () => {
      const vars = await provider.getVariables(mockContext, mockApp);
      expect(vars['RAILWAY_PROJECT_NAME']).toBe('my-proj');
      expect(vars['RAILWAY_ENVIRONMENT']).toBe('production');
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
  });
});
