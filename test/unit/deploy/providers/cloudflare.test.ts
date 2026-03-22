import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { CloudflareProvider } from '../../../../src/deploy/providers/cloudflare.js';
import { execAsync, spawnAsync } from '../../../../src/deploy/utils';
import { logger } from '@nexical/cli-core';
import fs from 'node:fs';
import { DeploymentContext, AppConfig } from '../../../../src/deploy/types.js';

vi.mock('../../../../src/deploy/utils', () => ({
  execAsync: vi.fn(),
  spawnAsync: vi.fn(() => Promise.reject(new Error('factory-fail'))),
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
    debug: vi.fn(),
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    // Don't set these here, set them in individual tests or reset correctly
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_KEY;
    delete process.env.CLOUDFLARE_EMAIL;
    (fs.promises.mkdir as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    vi.unstubAllGlobals();
  });

  describe('provision', () => {
    it('should support API Key authentication via env vars', async () => {
      vi.stubEnv('CLOUDFLARE_API_KEY', 'mock-key');
      vi.stubEnv('CLOUDFLARE_EMAIL', 'user@example.com');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'mock-account');
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'mock-token');

      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: { id: 'p1' } }),
        } as unknown as never) // project check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        } as unknown as never) // domains check
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: { id: 'd1' } }),
        } as unknown as never); // link attempt

      const app = { name: 'app1', domain: 'ex.com', provider: 'cloudflare', projectName: 'p' };
      await provider.provision({ options: {} } as unknown as never, app as unknown as never);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/domains'),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
          }),
        }),
      );
    });

    it('should fail if account ID is missing', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');

      await expect(
        provider.getSecrets(
          { options: {} } as unknown as never,
          { name: 'app1' } as unknown as never,
        ),
      ).rejects.toThrow('Cloudflare Account ID not found');
    });
    it('should handle debug mode in runWrangler', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      const app = { name: 'app1', provider: 'cloudflare', projectName: 'p' };

      // Use the valid mockContext to avoid TypeError in path.resolve
      const context = { ...mockContext, options: { debug: true } };

      const calls: string[] = [];
      vi.mocked(logger.info).mockImplementation((msg: string) => {
        calls.push(msg);
      });

      // Force failure to hit debug branch in runWrangler
      vi.mocked(spawnAsync).mockRejectedValue(new Error('fail'));

      // We expect it to throw eventually, but it should log failures first
      await expect(
        provider.deploy(context as unknown as never, app as unknown as never),
      ).rejects.toThrow();

      // Check all recorded calls
      expect(calls.some((c) => c.includes('Command failed on attempt 1'))).toBe(true);
      vi.unstubAllEnvs();
    });

    it('should handle dry run for DNS records', async () => {
      const app = { name: 'app1', domain: 'ex.com', provider: 'cloudflare', projectName: 'p' };
      await provider.provision(
        { options: { dryRun: true } } as unknown as never,
        app as unknown as never,
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('[Dry Run] Would check Cloudflare status'),
      );
    });

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
      vi.stubEnv('CLOUDFLARE_API_TOKEN', '');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'p' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('credentials missing'));
    });

    it('should provision successfully using default env vars', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Not Found',
        } as unknown as never) // check project
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        } as unknown as never); // check domains

      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'p' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Ensuring Cloudflare Pages project'),
      );
    });

    it('should handle failed domain link', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      vi.mocked(fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: { id: 'p1' } }),
        } as unknown as never) // check project
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, result: [] }),
        } as unknown as never) // check domains (empty)
        .mockResolvedValueOnce({ ok: false, text: async () => 'Link Fail' } as unknown as never); // link attempt

      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'p',
        domain: 'ex.com',
      } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to link domain ex.com: Link Fail'),
      );
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

      expect(global.fetch).toHaveBeenCalled();
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

    it('should handle custom token/account env vars', async () => {
      vi.stubEnv('CUSTOM_TOKEN_ENV', 'custom-tok');
      vi.stubEnv('CUSTOM_ACCOUNT_ENV', 'custom-acc');
      vi.stubEnv('CLOUDFLARE_API_TOKEN', ''); // Ensure default is empty
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', '');

      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        cloudflare: {
          token: 'CUSTOM_TOKEN_ENV',
          account: 'CUSTOM_ACCOUNT_ENV',
        },
      } as unknown as never;

      const secrets = await provider.getSecrets(mockContext, app);
      expect(secrets['CLOUDFLARE_API_TOKEN']).toBe('custom-tok');
      expect(secrets['CLOUDFLARE_ACCOUNT_ID']).toBe('custom-acc');
    });

    it('should handle custom secrets mapping', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      process.env.CUSTOM_VAL = 'resolved';
      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        secrets: { MY_SEC: 'CUSTOM_VAL' },
      } as AppConfig;

      const secrets = await provider.getSecrets(mockContext, app);
      expect(secrets['MY_SEC']).toBe('resolved');
      delete process.env.CUSTOM_VAL;
    });

    it('should throw if custom secret env var missing', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        secrets: { MY_SEC: 'MISSING_VAL' },
      } as AppConfig;

      await expect(provider.getSecrets(mockContext, app)).rejects.toThrow('mapping failed');
    });

    it('should throw if API Token missing', async () => {
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
      const app = { name: 'frontend', provider: 'cloudflare' } as AppConfig;
      await expect(provider.getSecrets(mockContext, app)).rejects.toThrow('API Token not found');
    });

    it('should throw if Account ID missing', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      const app = { name: 'frontend', provider: 'cloudflare' } as AppConfig;
      await expect(provider.getSecrets(mockContext, app)).rejects.toThrow('Account ID not found');
    });
  });

  describe('getVariables', () => {
    it('should throw if custom secret env var missing', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      // Ensure the var is NOT there
      vi.stubEnv('MISSING_SECRET', '');
      // Fix: secrets should be at top level for CloudflareProvider
      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        secrets: { MY_VAR: 'MISSING_SECRET' },
      } as unknown as never;
      await expect(provider.getSecrets(mockContext, app)).rejects.toThrow(
        /Env var 'MISSING_SECRET' not found/,
      );
      vi.unstubAllEnvs();
    });

    it('should return project variable', async () => {
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      const vars = await provider.getVariables(mockContext, app);
      expect(vars['CLOUDFLARE_PROJECT_NAME_FRONTEND']).toBe('my-app');
    });

    it('should throw on missing projectName', async () => {
      const app = { name: 'frontend', provider: 'cloudflare' } as AppConfig;
      await expect(provider.getVariables(mockContext, app)).rejects.toThrow(
        'Cloudflare project name not found',
      );
    });

    it('should handle project already exists error in provision', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');

      // 1. getSecrets succeeds
      // 2. project check fails with 404
      vi.mocked(fetch).mockResolvedValueOnce({ ok: false, status: 404 } as unknown as never);
      // 3. runWrangler (create project) fails with "already exists"
      vi.spyOn(provider as unknown as never, 'runWrangler').mockRejectedValueOnce(
        new Error('project already exists'),
      );

      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'p' } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('already exists (race condition)'),
      );
      vi.unstubAllEnvs();
    });

    it('should warn if domain linking fails in provision', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');

      // 1. getSecrets
      // 2. project check OK
      vi.mocked(fetch).mockResolvedValueOnce({ ok: true, status: 200 } as unknown as never);
      // 3. domains list OK
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: [] }),
      } as unknown as never);
      // 4. domain link fail
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Link Fail Reason',
      } as unknown as never);

      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'p',
        domain: 'a.com',
      } as AppConfig;
      await provider.provision(mockContext, app);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to link domain a.com: Link Fail Reason'),
      );
      vi.unstubAllEnvs();
    });

    it('should throw if custom mapped secret is missing', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      const app = { name: 'f', provider: 'cloudflare', secrets: { S: 'MISSING' } } as AppConfig;
      await expect(provider.getSecrets(mockContext, app)).rejects.toThrow(
        "Env var 'MISSING' not found",
      );
      vi.unstubAllEnvs();
    });

    it('should resolve custom env variables from process.env or literal', async () => {
      vi.stubEnv('MY_LITERAL', 'val');
      const app = {
        name: 'f',
        provider: 'cloudflare',
        projectName: 'p',
        env: { VAR1: 'MY_LITERAL', VAR2: 'RAW_VAL' },
      } as AppConfig;
      const vars = await provider.getVariables(mockContext, app);
      expect(vars['VAR1']).toBe('val');
      expect(vars['VAR2']).toBe('RAW_VAL');
      vi.unstubAllEnvs();
    });

    it('should handle project check API error with text() function', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Error Body'),
      } as unknown as never);
      const app = { name: 'f', provider: 'cloudflare', projectName: 'p' } as AppConfig;
      await expect(provider.provision(mockContext, app)).rejects.toThrow('Error Body');
      vi.unstubAllEnvs();
    });

    it('should log stderr in deploy failure if present', async () => {
      vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
      vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
      vi.spyOn(provider as unknown as never, 'runWrangler').mockRejectedValue(
        new Error('Cloudflare Fail'),
      );
      const app = { name: 'f', provider: 'cloudflare', projectName: 'p' } as AppConfig;
      await expect(provider.deploy(mockContext, app)).rejects.toThrow('Cloudflare Fail');
      vi.unstubAllEnvs();
    });

    it('should handle custom env variables', async () => {
      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'my-app',
        env: { VAR: 'VAL', FROM_ENV: 'EXISTING_ENV' },
      } as AppConfig;
      process.env.EXISTING_ENV = 'resolved';
      const vars = await provider.getVariables(mockContext, app);
      expect(vars['VAR']).toBe('VAL');
      expect(vars['FROM_ENV']).toBe('resolved');
      delete process.env.EXISTING_ENV;
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

    it('should retry on transient errors', async () => {
      process.env.CLOUDFLARE_API_TOKEN = 'tok';
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';

      const transientError = new Error('502 Bad Gateway');
      (transientError as unknown as never).output = 'Service Unavailable';

      (spawnAsync as Mock).mockRejectedValueOnce(transientError).mockResolvedValueOnce(undefined);

      vi.useFakeTimers();
      const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
      const deployPromise = provider.deploy(mockContext, app);

      await vi.runAllTimersAsync();
      await deployPromise;
      vi.useRealTimers();

      expect(spawnAsync).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Retrying in'));
    });

    it('should throw on missing projectName in deploy', async () => {
      const app = { name: 'frontend', provider: 'cloudflare' } as AppConfig;
      await expect(provider.deploy(mockContext, app)).rejects.toThrow('project name not found');
    });
  });

  it('should handle non-production environment', async () => {
    vi.stubEnv('CLOUDFLARE_API_TOKEN', 'tok');
    vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'acc');
    const app = { name: 'frontend', provider: 'cloudflare', projectName: 'my-app' } as AppConfig;
    const stagingContext = { ...mockContext, options: { env: 'staging' } };

    await provider.deploy(stagingContext as unknown as never, app);
    expect(spawnAsync).toHaveBeenCalledWith(
      'wrangler',
      expect.arrayContaining(['--project-name=my-app-staging']),
      expect.anything(),
    );
    vi.unstubAllEnvs();
  });

  it('should handle missing target in getCIConfig', () => {
    const app = { name: 'fe', provider: 'cloudflare', projectName: 'p' } as AppConfig;
    const ci = provider.getCIConfig('github', app);
    expect((ci.githubActionStep?.with as unknown as never).workingDirectory).toBe('.');
  });

  describe('getCIConfig', () => {
    it('should return CI config', () => {
      const app = {
        name: 'frontend',
        provider: 'cloudflare',
        projectName: 'my-app',
        target: 'apps/fe',
      } as AppConfig;
      const ci = provider.getCIConfig('github', app);
      expect(ci.secrets).toContain('CLOUDFLARE_API_TOKEN');
      expect((ci.githubActionStep?.with as unknown as never).workingDirectory).toBe('apps/fe');
    });
  });
});
