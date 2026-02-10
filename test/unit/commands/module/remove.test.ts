import { runCommand } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleRemoveCommand from '../../../../src/commands/module/remove.js';
import fs from 'fs-extra';

vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    logger: {
      ...mod.logger,
      success: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
    runCommand: vi.fn(),
  };
});
vi.mock('fs-extra');

describe('ModuleRemoveCommand', () => {
  let command: ModuleRemoveCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    command = new ModuleRemoveCommand({}, { rootDir: '/mock/root' });
    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.mocked(fs.pathExists).mockImplementation(async (p: string) => {
      if (p.includes('app.yml') || p.includes('nexical.yml')) return true;
      return true;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    await command.init();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have correct static properties', () => {
    expect(ModuleRemoveCommand.usage).toContain('module remove');
    expect(ModuleRemoveCommand.description).toBeDefined();
    expect(ModuleRemoveCommand.requiresProject).toBe(true);
    expect(ModuleRemoveCommand.args).toBeDefined();
  });

  it('should error if project root is missing', async () => {
    command = new ModuleRemoveCommand({}, { rootDir: undefined });
    vi.spyOn(command, 'init').mockImplementation(async () => {});
    vi.spyOn(command, 'error').mockImplementation(() => {});

    await command.runInit({ name: 'mod' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('requires to be run within an app project'),
      1,
    );
  });

  it('should remove submodule and sync', async () => {
    await command.run({ name: 'mod' });

    expect(runCommand).toHaveBeenCalledWith(
      expect.stringContaining('git submodule deinit'),
      '/mock/root',
    );
    expect(runCommand).toHaveBeenCalledWith(expect.stringContaining('git rm'), '/mock/root');
    expect(fs.remove).toHaveBeenCalledWith(expect.stringContaining('.git/modules'));
    expect(runCommand).toHaveBeenCalledWith('npm install', '/mock/root');
  });

  it('should error if module not found', async () => {
    vi.mocked(fs.pathExists).mockImplementation(async () => false);
    await command.run({ name: 'missing' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
  });

  it('should handle failure during remove', async () => {
    vi.mocked(runCommand).mockRejectedValue(new Error('Git remove failed'));
    await command.run({ name: 'mod' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to remove module'));
  });

  it('should skip .git/modules cleanup if not found', async () => {
    vi.mocked(fs.pathExists).mockImplementation(async (p: string) => {
      if (p.includes('.git/modules')) return false;
      return true;
    });
    await command.run({ name: 'mod' });
    expect(fs.remove).not.toHaveBeenCalledWith(expect.stringContaining('.git/modules'));
  });
});
