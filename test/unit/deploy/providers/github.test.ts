import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { GitHubProvider } from '../../../../src/deploy/providers/github.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import fs from 'node:fs/promises';
import { DeploymentContext } from '../../../../src/deploy/types.js';

vi.mock('node:fs/promises');
vi.mock('../../../../src/deploy/utils.js');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  let mockContext: DeploymentContext;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new GitHubProvider();
    mockContext = {
      cwd: '/mock',
      options: {},
      config: { deploy: { repository: { provider: 'github' }, apps: {} } },
    } as unknown as DeploymentContext;
    (execAsync as Mock).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
    (fs.readFile as Mock).mockResolvedValue(
      'name: ${APP_NAME}\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    steps: []',
    );
    (fs.mkdir as Mock).mockResolvedValue(undefined);
    (fs.writeFile as Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('configureSecrets', () => {
    it('should set secrets', async () => {
      await provider.configureSecrets(mockContext, { KEY: 'VALUE' });
      expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('gh secret set KEY'));
    });

    it('should skip empty secrets', async () => {
      await provider.configureSecrets(mockContext, { KEY: '' });
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.configureSecrets(mockContext, { KEY: 'VALUE' });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });
  });

  describe('configureVariables', () => {
    it('should set variables', async () => {
      await provider.configureVariables(mockContext, { KEY: 'VALUE' });
      expect(execAsync).toHaveBeenCalledWith(expect.stringContaining('gh variable set KEY'));
    });

    it('should skip empty variables', async () => {
      await provider.configureVariables(mockContext, { KEY: '' });
      expect(execAsync).not.toHaveBeenCalled();
    });

    it('should handle dry run', async () => {
      mockContext.options.dryRun = true;
      await provider.configureVariables(mockContext, { KEY: 'VALUE' });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Dry Run]'));
      expect(execAsync).not.toHaveBeenCalled();
    });
  });

  describe('generateWorkflow', () => {
    it('should generate workflow file', async () => {
      const targets = [
        {
          provider: {
            name: 'railway',
            getCIConfig: () => ({
              installSteps: ['run install'],
              deploySteps: ['run deploy'],
              secrets: ['SEC'],
              githubActionStep: { name: 'Action' },
            }),
          },
          app: { name: 'rw', provider: 'railway' },
        },
      ] as unknown as any;

      await provider.generateWorkflow(mockContext, targets);

      expect(fs.writeFile).toHaveBeenCalled();
      const content = (fs.writeFile as Mock).mock.calls[0][1];
      expect(content).toContain('name: Deploy rw to railway');
    });

    it('should support paths trigger', async () => {
      const targets = [
        {
          provider: {
            name: 'frontend',
            getCIConfig: () => ({}),
          },
          app: {
            name: 'fe',
            provider: 'cloudflare',
            paths: ['apps/frontend/**'],
          },
        },
      ] as unknown as any;

      await provider.generateWorkflow(mockContext, targets);

      expect(fs.writeFile).toHaveBeenCalled();
      const content = (fs.writeFile as Mock).mock.calls[0][1];
      expect(content).toContain('paths:');
      expect(content).toContain('- apps/frontend/**');
    });

    it('should skip if no targets provided', async () => {
      await provider.generateWorkflow(mockContext, []);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
