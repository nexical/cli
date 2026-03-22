import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleRemoveCommand from '../../../../src/commands/module/remove.js';
import fs from 'fs-extra';
import * as cliCore from '@nexical/cli-core';

// Mocks
vi.mock('fs-extra');
vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    runCommand: vi.fn(),
  };
});

describe('ModuleRemoveCommand', () => {
  let command: ModuleRemoveCommand;
  const projectRoot = '/mock/project/root';

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock logger
    vi.spyOn(cliCore.logger, 'debug').mockImplementation(() => {});
    vi.spyOn(cliCore.logger, 'warn').mockImplementation(() => {});
    vi.spyOn(cliCore.logger, 'info').mockImplementation(() => {});

    command = new ModuleRemoveCommand({} as unknown as cliCore.CLIConfig, { rootDir: projectRoot });
    (command as unknown as { projectRoot: string }).projectRoot = projectRoot;

    // Explicitly spy on command methods
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});

    vi.mocked(cliCore.runCommand as unknown as () => Promise<void>).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should identify and remove a backend module', async () => {
    // Setup: Simulate module exists in backend
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        const pStr = p.toString();
        if (pStr.includes('apps/backend/modules/test-mod')) return true;
        if (pStr.includes('nexical.yaml')) return true;
        return false;
      },
    );
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  backend:\n    - test-mod',
    );
    vi.mocked(fs.writeFile as unknown as () => Promise<void>).mockResolvedValue(undefined);

    await command.run({ name: 'test-mod' });

    // Verify git commands
    expect(cliCore.runCommand).toHaveBeenCalledWith(
      expect.stringContaining('git submodule deinit -f apps/backend/modules/test-mod'),
      projectRoot,
    );
    expect(cliCore.runCommand).toHaveBeenCalledWith(
      expect.stringContaining('git rm -f apps/backend/modules/test-mod'),
      projectRoot,
    );

    // Verify config update
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('nexical.yaml'),
      expect.not.stringContaining('test-mod'),
    );
  });

  it('should error if module not found', async () => {
    vi.mocked(fs.pathExists as unknown as () => Promise<boolean>).mockResolvedValue(false);

    await command.run({ name: 'missing-mod' });

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
    expect(cliCore.runCommand).not.toHaveBeenCalled();
  });

  it('should remove from legacy modules array', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        const pStr = p.toString();
        if (pStr.includes('apps/backend/modules/legacy-mod')) return true;
        if (pStr.includes('nexical.yaml')) return true;
        return false;
      },
    );
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  - other-mod\n  - legacy-mod',
    );

    await command.run({ name: 'legacy-mod' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('nexical.yaml'),
      expect.not.stringContaining('legacy-mod'),
    );
  });

  it('should handle error during nexical.yaml update', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        const pStr = p.toString();
        if (pStr.includes('apps/backend/modules/test-mod')) return true;
        if (pStr.includes('nexical.yaml')) return true;
        return false;
      },
    );
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  backend:\n    - test-mod',
    );
    vi.mocked(fs.writeFile as unknown as () => Promise<void>).mockRejectedValue(
      new Error('Write fail'),
    );

    await command.run({ name: 'test-mod' });
    expect(cliCore.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update nexical.yaml: Write fail'),
    );
  });

  it('should handle non-Error exception during nexical.yaml update', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        const pStr = p.toString();
        if (pStr.includes('apps/backend/modules/test-mod')) return true;
        if (pStr.includes('nexical.yaml')) return true;
        return false;
      },
    );
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  backend:\n    - test-mod',
    );
    vi.mocked(fs.writeFile as unknown as () => Promise<void>).mockRejectedValue('String fail');

    await command.run({ name: 'test-mod' });
    expect(cliCore.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update nexical.yaml: String fail'),
    );
  });

  it('should handle error during run method', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        if (p.includes('apps/backend/modules/fail-mod')) return true;
        return false;
      },
    );
    vi.mocked(cliCore.runCommand as unknown as () => Promise<void>).mockRejectedValue(
      new Error('Git fail'),
    );

    await command.run({ name: 'fail-mod' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove module: Git fail'),
    );
  });

  it('should handle non-Error exception during run method', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        if (p.includes('apps/backend/modules/fail-mod')) return true;
        return false;
      },
    );
    vi.mocked(cliCore.runCommand as unknown as () => Promise<void>).mockRejectedValue(
      'String error',
    );

    await command.run({ name: 'fail-mod' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to remove module: String error'),
    );
  });
  it('should do nothing if nexical.yaml is missing', async () => {
    vi.mocked(fs.pathExists as unknown as (path: string) => Promise<boolean>).mockImplementation(
      async (p: string) => {
        if (p.includes('apps/backend/modules/test-mod')) return true;
        if (p.includes('nexical.yaml')) return false;
        return false;
      },
    );

    await command.run({ name: 'test-mod' });
    // Should return early and not try to read config
    expect(fs.readFile).not.toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith(expect.stringContaining('removed successfully'));
  });
  it('should handle missing modules key in config', async () => {
    vi.mocked(fs.pathExists as unknown as () => Promise<boolean>).mockResolvedValue(true);
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue('key: value');

    await command.run({ name: 'test-mod' });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should do nothing if module not found in config lists', async () => {
    vi.mocked(fs.pathExists as unknown as () => Promise<boolean>).mockResolvedValue(true);
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  backend:\n    - existing-mod',
    );

    await command.run({ name: 'other-mod' });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('should handle empty or null config from YAML.parse', async () => {
    vi.mocked(fs.pathExists as unknown as () => Promise<boolean>).mockResolvedValue(true);
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(''); // YAML.parse('') -> null

    await command.run({ name: 'test-mod' });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('should handle legacy array without the module to remove', async () => {
    vi.mocked(fs.pathExists as unknown as () => Promise<boolean>).mockResolvedValue(true);
    vi.mocked(fs.readFile as unknown as () => Promise<string>).mockResolvedValue(
      'modules:\n  - other-mod',
    );

    await command.run({ name: 'test-mod' });
    expect(fs.writeFile).not.toHaveBeenCalled();
  });
});
