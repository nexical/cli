import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GitHubProvider } from '../../../../src/deploy/providers/github.js';
import { execAsync } from '../../../../src/deploy/utils.js';
import { logger } from '@nexical/cli-core';
import fs from 'node:fs/promises';

vi.mock('node:fs/promises');
vi.mock('../../../../src/deploy/utils.js');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe('GitHubProvider', () => {
  let provider: GitHubProvider;
  let mockContext: any;

  beforeEach(() => {
    vi.resetAllMocks();
    provider = new GitHubProvider();
    mockContext = {
      cwd: '/mock',
      options: {},
      config: { deploy: { backend: {}, frontend: {} } },
    } as unknown as any;
    (execAsync as unknown as { mockResolvedValue: (val: unknown) => void }).mockResolvedValue({
      stdout: '',
      stderr: '',
    });
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
          type: 'frontend',
          name: 'cf',
          getCIConfig: () => ({
            installSteps: ['run install'],
            deploySteps: ['run deploy'],
            secrets: ['SEC'],
            githubActionStep: { name: 'Action' },
          }),
        },
        {
          type: 'backend',
          name: 'rw',
          getCIConfig: () => ({
            deploySteps: ['run backend'],
          }),
        },
      ] as unknown as any;

      await provider.generateWorkflow(mockContext, targets);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
    });

    it('should skip if no config', async () => {
      const targets = [
        {
          type: 'frontend',
          getCIConfig: () => null,
        },
      ] as unknown as any;
      await provider.generateWorkflow(mockContext, targets);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle no targets', async () => {
      await provider.generateWorkflow(mockContext, []);
      expect(fs.writeFile).not.toHaveBeenCalled();
    });

    it('should handle target with no deploy steps', async () => {
      const targets = [
        {
          type: 'backend',
          name: 'test',
          getCIConfig: () => ({
            // explicit undefined deploySteps
            deploySteps: undefined,
            secrets: [],
          }),
        },
      ] as unknown as any;

      await provider.generateWorkflow(mockContext, targets);
      expect(fs.writeFile).toHaveBeenCalled();
      // Verify content doesn't crash
      const content = (fs.writeFile as unknown as { mock: { calls: any[][] } }).mock.calls[0][1];
      expect(content).toContain('Deploy Backend to test');
    });
  });
});
