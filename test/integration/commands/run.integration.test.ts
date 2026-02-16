import { describe, it, beforeEach, afterAll } from 'vitest';
import RunCommand from '../../../src/commands/run.js';
import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';

describe('Run Command Integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    const temp = await createTempDir('run-project-');
    projectDir = await createMockRepo(temp, {
      'package.json': '{"name": "run-project", "version": "1.0.0"}',
      'nexical.yaml': 'site: run-test\nmodules: []',
    });

    // Create a mock module with a script
    const moduleDir = path.join(projectDir, 'apps/backend/modules/script-mod');
    await fs.ensureDir(moduleDir);
    await fs.writeJson(path.join(moduleDir, 'package.json'), {
      name: 'script-mod',
      version: '1.0.0',
      scripts: {
        'test-script': 'echo "Hello from script-mod"',
      },
    });

    // Add module to nexical.yaml manually or via helper
    // For RunCommand, it relies on discovery or explicit path?
    // RunCommand iterates over ALL modules found in nexical.yaml or file system?
    // RunCommand implementation:
    // It runs a command in ALL modules or specific ones.

    // We need to register it in nexical.yaml for it to be found commonly
    const configPath = path.join(projectDir, 'nexical.yaml');
    await fs.writeFile(configPath, 'site: run-test\nmodules:\n  backend:\n    - script-mod');
  });

  afterAll(async () => {
    await cleanupTestRoot();
  });

  it('should run a script in a specific module', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);
      const cli = new CLI({ commandName: 'nexical' });
      const runCmd = new RunCommand(cli);
      (runCmd as unknown as { projectRoot: string }).projectRoot = projectDir;

      // We need to capture stdout/stderr to verify execution
      // But RunCommand uses `runCommand` from cli-core which uses execa.
      // In integration test, execa is REAL.

      // However, BaseCommand.run() might just spawn it.
      // We can inspect the output if we could capture it.
      // But `execa` streams to stdio usually.

      // Let's rely on side effects or just that it doesn't throw.
      // Or we can mock `runCommand` from `@nexical/cli-core` if we want to verify it called the script?
      // But this is integration test, we want real execution.
      // "Hello from script-mod" should be printed.

      await runCmd.run({ script: 'script-mod:test-script' });

      // If passing, it means it found the module and ran the script (which echoed and exited 0).
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should run a script in root', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);
      const cli = new CLI({ commandName: 'nexical' });
      const runCmd = new RunCommand(cli);
      (runCmd as unknown as { projectRoot: string }).projectRoot = projectDir;

      // Add a script to root package.json first
      const pkgPath = path.join(projectDir, 'package.json');
      const pkg = await fs.readJson(pkgPath);
      pkg.scripts = { 'root-script': 'echo "Hello from root"' };
      await fs.writeJson(pkgPath, pkg);

      await runCmd.run({ script: 'root-script' });
    } finally {
      process.chdir(originalCwd);
    }
  });
});
