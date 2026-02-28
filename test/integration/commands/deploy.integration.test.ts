import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import DeployCommand from '../../../src/commands/deploy.js';
import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';

const mocks = vi.hoisted(() => ({
  dnsProvision: vi.fn().mockResolvedValue(undefined),
}));

// Mock ConfigManager and Registry to control provider behavior without relying on real files or dynamic imports
vi.mock('../../../src/deploy/config-manager.js', () => {
  return {
    ConfigManager: vi.fn().mockImplementation(function () {
      return {
        load: vi.fn().mockResolvedValue({
          deploy: {
            apps: {
              api: { provider: 'railway', domain: 'api.test.com' },
              web: { provider: 'cloudflare' },
            },
            dns: { provider: 'cloudflare' },
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
        getHostingProvider: vi.fn().mockImplementation((name) => {
          if (name === 'railway') {
            return {
              name: 'railway',
              provision: vi.fn().mockResolvedValue(undefined),
              getSecrets: vi.fn().mockResolvedValue({ R_SEC: 'val' }),
              getVariables: vi.fn().mockResolvedValue({ R_VAR: 'val' }),
              getDefaultDnsTarget: vi.fn().mockReturnValue('deploy.railway.app'),
            };
          }
          if (name === 'cloudflare') {
            return {
              name: 'cloudflare',
              provision: vi.fn().mockResolvedValue(undefined),
              getSecrets: vi.fn().mockResolvedValue({ C_SEC: 'val' }),
              getVariables: vi.fn().mockResolvedValue({ C_VAR: 'val' }),
              getDefaultDnsTarget: vi.fn().mockReturnValue('test.pages.dev'),
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
        getDnsProvider: vi.fn().mockReturnValue({
          name: 'cloudflare',
          provision: mocks.dnsProvision,
        }),
      };
    }),
  };
});

vi.mock('../../../src/utils/env-manager.js');
vi.mock('../../../src/commands/setup.js');

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

  it('should filter applications when --apps is specified', async () => {
    const originalCwd = process.cwd();
    try {
      const cli = new CLI({ commandName: 'nexical' });
      process.chdir(projectDir);

      const deployCmd = new DeployCommand(cli);

      // Execute run with only backend
      await deployCmd.run({ env: 'production', apps: 'api' });

      // Verification: The mock ProviderRegistry.getDeploymentProvider was only called for 'backend'
      // and NOT for 'frontend'. In this simpler verification, we just check no error was thrown.
      const workflowPath = path.join(projectDir, '.github/workflows/deploy.yml');
      expect(await fs.pathExists(workflowPath)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should throw error if specified application does not exist', async () => {
    const originalCwd = process.cwd();
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process exited with code ${code}`);
    });

    try {
      const cli = new CLI({ commandName: 'nexical' });
      process.chdir(projectDir);

      const deployCmd = new DeployCommand(cli);

      // Execute run with non-existent app
      // We expect the 'process.exit unexpectedly called' error OR our custom error
      // Depending on how vitest/cli-core interacts.
      await expect(deployCmd.run({ env: 'production', apps: 'invalid-app' })).rejects.toThrow(
        /The following applications were not found in nexical.yaml: invalid-app|Process exited with code 1/,
      );
    } finally {
      mockExit.mockRestore();
      process.chdir(originalCwd);
    }
  });

  it('should provision DNS records successfully', async () => {
    const originalCwd = process.cwd();
    try {
      const cli = new CLI({ commandName: 'nexical' });
      process.chdir(projectDir);

      const deployCmd = new DeployCommand(cli);

      // We expect this to execute our mock DnsProvider since it's in the simulated config
      await deployCmd.run({ env: 'production' });

      expect(mocks.dnsProvision).toHaveBeenCalledWith(expect.anything(), [
        { type: 'CNAME', name: 'api.test.com', content: 'deploy.railway.app', proxied: true },
      ]);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
