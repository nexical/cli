import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleUpdateCommand from '../../../../src/commands/module/update.js';
import fs from 'fs-extra';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { runCommand, logger } from '@nexical/cli-core';

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
    command = new ModuleUpdateCommand({} as unknown as any, {} as unknown as any);
    (runCommand as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
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
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      return p.includes('apps/frontend/modules/ui-mod');
    });

    await command.run({ name: 'ui-mod' });

    expect(runCommand).toHaveBeenCalledWith(
      expect.stringContaining('git submodule update --remote --merge apps/frontend/modules/ui-mod'),
      expect.any(String),
    );
  });

  it('should error if specific module not found', async () => {
    (fs.pathExists as unknown as { mockResolvedValue: any }).mockResolvedValue(false);
    await command.run({ name: 'missing-mod' });
    expect(command.error).toHaveBeenCalledWith('Module missing-mod not found.');
  });

  it('should handle error during update', async () => {
    (runCommand as unknown as { mockRejectedValue: any }).mockRejectedValue(new Error('Git fail'));
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update modules: Git fail'),
    );
  });

  it('should handle non-Error exception during update', async () => {
    (runCommand as unknown as { mockRejectedValue: any }).mockRejectedValue('String error');
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update modules: String error'),
    );
  });
});
