import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import ModuleAddCommand from '../../../src/commands/module/add.js';
import ModuleRemoveCommand from '../../../src/commands/module/remove.js';
import ModuleListCommand from '../../../src/commands/module/list.js';
import ModuleUpdateCommand from '../../../src/commands/module/update.js';

import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';

// Mock picocolors to return strings as-is for easy matching
vi.mock('picocolors', () => ({
  default: {
    bold: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    dim: (s: string) => s,
    red: (s: string) => s,
    green: (s: string) => s,
    blue: (s: string) => s,
    magenta: (s: string) => s,
  },
}));

describe('Module Commands Integration', () => {
  let projectDir: string;
  let moduleRepo: string;
  let consoleTableSpy: unknown;

  beforeEach(async () => {
    // 1. Create a "Project" that is a git repo
    const temp = await createTempDir('module-project-');
    projectDir = await createMockRepo(temp, {
      'package.json': '{"name": "test-project", "version": "1.0.0"}',
      'nexical.yaml': 'site: test\nmodules: []',
    });

    // Allow file protocol for submodules in this repo
    // await execa('git', ['config', 'protocol.file.allow', 'always'], { cwd: projectDir }); // Config approach failed
    process.env.GIT_ALLOW_PROTOCOL = 'file';

    // 2. Create a "Module" that is a SEPARATE git repo
    const modTemp = await createTempDir('module-source-');
    moduleRepo = await createMockRepo(modTemp, {
      'package.json': '{"name": "my-module", "version": "1.0.0", "description": "Awesome module"}',
      'module.yaml': 'name: my-module\nversion: 1.0.0',
      'index.ts': 'export const hello = "world";',
    });

    consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Switch CWD to project for commands to find root
    // Note: process.chdir behavior might persist, so we rely on mocking or careful cleanup
    // But integration tests run sequentially in same thread usually with vitest unless configured otherwise.
    // We will pass specific CWD to commands if possible, OR chdir and restore.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupTestRoot();
  });

  it('should add, list, update and remove a module', async () => {
    const originalCwd = process.cwd();
    const cli = new CLI({ commandName: 'nexical' });
    try {
      process.chdir(projectDir);

      // 1. ADD MODULE
      const addCmd = new ModuleAddCommand(cli);

      await addCmd.init();
      await addCmd.run({ url: moduleRepo });

      const modulePath = path.join(projectDir, 'modules/my-module');
      expect(fs.existsSync(modulePath)).toBe(true);
      expect(fs.existsSync(path.join(modulePath, 'package.json'))).toBe(true);

      // Verify nexical.yaml updated
      const config = await fs.readFile(path.join(projectDir, 'nexical.yaml'), 'utf8');
      expect(config).toContain('modules:');
      expect(config).toContain('- my-module');

      // Check it is a submodule
      // .git file in module dir pointing to gitdir
      expect(fs.existsSync(path.join(modulePath, '.git'))).toBe(true);
      const gitModules = await fs.readFile(path.join(projectDir, '.gitmodules'), 'utf-8');
      expect(gitModules).toContain('path = modules/my-module');

      // 2. LIST MODULES with valid module
      const listCmd = new ModuleListCommand(cli);
      await listCmd.init();
      await listCmd.run();

      // Check console.table called with module info
      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'my-module',
            version: '1.0.0',
            description: 'Awesome module',
          }),
        ]),
      );

      // 3. UPDATE MODULE
      const updateCmd = new ModuleUpdateCommand(cli);
      await updateCmd.init();
      await updateCmd.run({ name: 'my-module' });
      // Hard to check "update" without changing the remote first.
      // But we verify it ran without throwing.

      // 4. REMOVE MODULE
      const removeCmd = new ModuleRemoveCommand(cli);
      await removeCmd.init();
      await removeCmd.run({ name: 'my-module' });

      expect(fs.existsSync(modulePath)).toBe(false);

      // Verify git cleanup
      // .git/modules/modules/my-module should be gone
      const gitInternalModuleDir = path.join(projectDir, '.git/modules/modules/my-module');
      expect(fs.existsSync(gitInternalModuleDir)).toBe(false);

      // .gitmodules entry gone? `git rm` usually handles this.
      // Check if .gitmodules file exists (if empty it might remain or be deleted depending on git version, usually implicitly updated)
      if (fs.existsSync(path.join(projectDir, '.gitmodules'))) {
        const updatedGitModules = await fs.readFile(path.join(projectDir, '.gitmodules'), 'utf-8');
        expect(updatedGitModules).not.toContain('modules/my-module');
      }

      // Verify nexical.yaml updated
      const configRemoved = await fs.readFile(path.join(projectDir, 'nexical.yaml'), 'utf8');
      expect(configRemoved).not.toContain('- my-module');
    } finally {
      process.chdir(originalCwd);
    }
  });
});
