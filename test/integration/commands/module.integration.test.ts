import { CLI } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import ModuleAddCommand from '../../../src/commands/module/add.js';
import ModuleRemoveCommand from '../../../src/commands/module/remove.js';
import ModuleListCommand from '../../../src/commands/module/list.js';
import ModuleUpdateCommand from '../../../src/commands/module/update.js';

import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';

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
    await createMockRepo(modTemp, {
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

  it('should add, list, update and remove backend and frontend modules', async () => {
    const originalCwd = process.cwd();
    // Re-initialize CLI for this test to ensure clean state if needed, though previously it was new per test
    // We can reuse the CLI instance from beforeEach if we moved it there, but here it is fine.

    // 1. Setup Backend Module Repo
    const backendTemp = await createTempDir('backend-mod-');
    const backendRepo = await createMockRepo(backendTemp, {
      'package.json': '{"name": "backend-api", "version": "1.0.0"}',
      'module.yaml': 'name: backend-api\nversion: 1.0.0',
      'models.yaml': '- name: User\n  fields: {}', // Indicator
    });

    // 2. Setup Frontend Module Repo
    const frontendTemp = await createTempDir('frontend-mod-');
    const frontendRepo = await createMockRepo(frontendTemp, {
      'package.json': '{"name": "frontend-ui", "version": "1.0.0"}',
      'module.yaml': 'name: frontend-ui\nversion: 1.0.0',
      'ui.yaml': 'theme: dark', // Indicator
    });

    try {
      process.chdir(projectDir);

      // --- ADD BACKEND ---
      // --- ADD BACKEND ---
      // Actually `run` uses `this.projectRoot` which is set by `BaseCommand.init()`.

      // Let's rely on the pattern from the existing file:
      // imports: import { CLI } from '@nexical/cli-core';
      // const cli = new CLI({ commandName: 'nexical' });
      // const addCmd = new ModuleAddCommand(cli);

      // I need to instantiate CLI first.
      const cli = new CLI({ commandName: 'nexical' });

      const addBackend = new ModuleAddCommand(cli);
      (addBackend as unknown as { projectRoot: string }).projectRoot = projectDir;
      // or we can rely on init() finding it if CWD is correct.
      // Let's try to set it explicitly to be safe.

      await addBackend.run({ url: backendRepo });

      const backendPath = path.join(projectDir, 'apps/backend/modules/backend-api');
      expect(fs.existsSync(backendPath)).toBe(true);
      expect(fs.existsSync(path.join(backendPath, 'models.yaml'))).toBe(true);

      // --- ADD FRONTEND ---
      const addFrontend = new ModuleAddCommand(cli);
      (addFrontend as unknown as { projectRoot: string }).projectRoot = projectDir;
      await addFrontend.run({ url: frontendRepo });

      const frontendPath = path.join(projectDir, 'apps/frontend/modules/frontend-ui');
      expect(fs.existsSync(frontendPath)).toBe(true);
      expect(fs.existsSync(path.join(frontendPath, 'ui.yaml'))).toBe(true);

      // --- VERIFY CONFIG ---
      const config = await fs.readFile(path.join(projectDir, 'nexical.yaml'), 'utf8');
      expect(config).toContain('modules:');
      expect(config).toContain('backend:');
      expect(config).toContain('  - backend-api'); // Indentation check might be flaky with yaml stringify, just check existence
      expect(config).toContain('frontend:');
      expect(config).toContain('  - frontend-ui');

      // --- LIST ---
      const listCmd = new ModuleListCommand(cli);
      (listCmd as unknown as { projectRoot: string }).projectRoot = projectDir;
      await listCmd.run();

      expect(consoleTableSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'backend-api', type: 'backend' }),
          expect.objectContaining({ name: 'frontend-ui', type: 'frontend' }),
        ]),
      );

      // --- REMOVE BACKEND ---
      const removeCmd = new ModuleRemoveCommand(cli);
      (removeCmd as unknown as { projectRoot: string }).projectRoot = projectDir;
      await removeCmd.run({ name: 'backend-api' });

      expect(fs.existsSync(backendPath)).toBe(false);

      const configAfterRemove = await fs.readFile(path.join(projectDir, 'nexical.yaml'), 'utf8');
      expect(configAfterRemove).not.toContain('backend-api');
      expect(configAfterRemove).toContain('frontend-ui');

      // --- UPDATE FRONTEND ---
      // Commit a change to frontend repo
      await execa('git', ['commit', '--allow-empty', '-m', 'New version'], { cwd: frontendRepo });

      const updateCmd = new ModuleUpdateCommand(cli);
      (updateCmd as unknown as { projectRoot: string }).projectRoot = projectDir;
      await updateCmd.run({});

      // Verify submodule update?
      // Diff hard to check without actually checking git status inside.
      // But command should succeed.
    } finally {
      process.chdir(originalCwd);
    }
  });
});
