import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import SetupCommand from '../../../src/commands/setup.js';
import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';

describe('Setup Command Integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    const temp = await createTempDir('setup-project-');
    projectDir = await createMockRepo(temp, {
      'package.json': '{"name": "setup-project", "version": "1.0.0"}',
      'nexical.yaml': 'site: setup-test\nmodules: []',
    });

    // Create core assets
    await fs.ensureDir(path.join(projectDir, 'core/src'));
    await fs.writeFile(path.join(projectDir, 'core/src/shared.ts'), 'export const shared = true;');

    // Create app directories
    await fs.ensureDir(path.join(projectDir, 'apps/backend'));
    await fs.ensureDir(path.join(projectDir, 'apps/frontend'));
  });

  afterAll(async () => {
    await cleanupTestRoot();
  });

  it('should symlink core assets to apps', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir); // Change CWD to simulate running from root
      const cli = new CLI({ commandName: 'nexical' });
      const setupCmd = new SetupCommand(cli);

      // Execute setup command
      await setupCmd.run();

      // Verify symlinks
      const backendSrc = path.join(projectDir, 'apps/backend/src');
      expect(await fs.pathExists(backendSrc)).toBe(true);
      const stat = await fs.lstat(backendSrc);
      expect(stat.isSymbolicLink()).toBe(true);

      const frontendSrc = path.join(projectDir, 'apps/frontend/src');
      expect(await fs.pathExists(frontendSrc)).toBe(true);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
