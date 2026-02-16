import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import DeployCommand from '../../../src/commands/deploy.js';
import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';

// Mock ConfigManager and Registry to control provider behavior without relying on real files or dynamic imports
vi.mock('../../../src/deploy/config-manager.js', () => {
  return {
    ConfigManager: vi.fn().mockImplementation(function () {
      return {
        load: vi.fn().mockResolvedValue({
          deploy: {
            backend: { provider: 'railway' },
            frontend: { provider: 'cloudflare' },
            repository: { provider: 'github' },
          },
        }),
      };
    }),
  };
});

vi.mock('../../../src/deploy/registry.js', () => {
  return {
    ProviderRegistry: vi.fn().mockImplementation(function () {
      return {
        loadCoreProviders: vi.fn(),
        loadLocalProviders: vi.fn(),
        getDeploymentProvider: vi.fn().mockImplementation((name) => {
          if (name === 'railway') {
            return {
              name: 'railway',
              provision: vi.fn().mockResolvedValue(undefined),
              getSecrets: vi.fn().mockResolvedValue({ R_SEC: 'val' }),
              getVariables: vi.fn().mockResolvedValue({ R_VAR: 'val' }),
            };
          }
          if (name === 'cloudflare') {
            return {
              name: 'cloudflare',
              provision: vi.fn().mockResolvedValue(undefined),
              getSecrets: vi.fn().mockResolvedValue({ C_SEC: 'val' }),
              getVariables: vi.fn().mockResolvedValue({ C_VAR: 'val' }),
            };
          }
          return undefined;
        }),
        getRepositoryProvider: vi.fn().mockReturnValue({
          name: 'github',
          configureSecrets: vi.fn().mockResolvedValue(undefined),
          configureVariables: vi.fn().mockResolvedValue(undefined),
          generateWorkflow: vi.fn().mockImplementation(async (ctx, vars) => {
            // Simulate writing a workflow file to verify context
            const targetDir = path.join(ctx.cwd, '.github/workflows');
            const targetFile = path.join(targetDir, 'deploy.yml');
            await fs.ensureDir(targetDir);
            await fs.writeFile(targetFile, 'yaml content');
          }),
        }),
      };
    }),
  };
});

describe('Deploy Command Integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    const temp = await createTempDir('deploy-project-');
    projectDir = await createMockRepo(temp, {
      'package.json': '{"name": "deploy-project", "version": "1.0.0"}',
      'nexical.yaml': 'site: deploy-test\nmodules: []',
      '.env': 'TEST_ENV=true',
    });
  });

  afterAll(async () => {
    await cleanupTestRoot();
  });

  it('should execute full deployment flow', async () => {
    const originalCwd = process.cwd();
    try {
      // Create a CLI instance
      const cli = new CLI({ commandName: 'nexical' });
      process.chdir(projectDir);

      const deployCmd = new DeployCommand(cli);

      // Execute run
      await deployCmd.run({ env: 'production' });

      // Verify file creation from our mocked provider
      const workflowPath = path.join(projectDir, '.github/workflows/deploy.yml');
      expect(await fs.pathExists(workflowPath)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
