import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleUpdateCommand from '../../../../src/commands/module/update.js';
import fs from 'fs-extra';
import { runCommand } from '@nexical/cli-core';

// Mocks
vi.mock('fs-extra');
vi.mock('@nexical/cli-core', async () => {
  return {
    BaseCommand: class {
      projectRoot = '/mock/project/root';
      info = vi.fn();
      success = vi.fn();
      error = vi.fn();
    },
    logger: { debug: vi.fn(), warn: vi.fn() },
    runCommand: vi.fn(),
  };
});

describe('ModuleUpdateCommand', () => {
  let command: ModuleUpdateCommand;

  beforeEach(() => {
    vi.resetAllMocks();
    command = new ModuleUpdateCommand({} as never, {} as never);
    vi.mocked(runCommand).mockResolvedValue(undefined as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should update all modules if no name provided', async () => {
    await command.run({});

    expect(runCommand).toHaveBeenCalledWith(
      'git submodule update --remote --merge',
      expect.any(String),
    );
  });

  it('should update specific module if name provided', async () => {
    vi.mocked(fs.pathExists).mockImplementation((p: string) => {
      return p.includes('apps/frontend/modules/ui-mod');
    });

    await command.run({ name: 'ui-mod' });

    expect(runCommand).toHaveBeenCalledWith(
      expect.stringContaining('git submodule update --remote --merge apps/frontend/modules/ui-mod'),
      expect.any(String),
    );
  });

  it('should error if specific module not found', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);
    await command.run({ name: 'missing-mod' });
    expect(command.error).toHaveBeenCalledWith('Module missing-mod not found.');
  });

  it('should handle error during update', async () => {
    vi.mocked(runCommand).mockRejectedValue(new Error('Git fail') as never);
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update modules: Git fail'),
    );
  });

  it('should handle non-Error exception during update', async () => {
    vi.mocked(runCommand).mockRejectedValue('String error' as never);
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update modules: String error'),
    );
  });
});
