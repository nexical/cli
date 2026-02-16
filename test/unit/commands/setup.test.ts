import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SetupCommand from '../../../src/commands/setup.js';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';

// Mock fs-extra
vi.mock('fs-extra');

describe('SetupCommand', () => {
  let command: SetupCommand;
  let mockCli: CLI;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCli = new CLI({ commandName: 'test-cli' });
    command = new SetupCommand(mockCli);

    // Spy on logging methods
    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});

    // Mock process.cwd to return a known path
    vi.spyOn(process, 'cwd').mockReturnValue('/mock/project/root');

    // Mock process.exit
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should error if "core" directory is missing', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await command.run();

    expect(command.error).toHaveBeenCalledWith(
      'Could not find "core" directory. Are you in the project root?',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should warn and skip if app directory is missing', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pStr = p.toString();
      if (pStr.endsWith('core')) return true;
      if (pStr.endsWith('apps/frontend')) return true;
      if (pStr.endsWith('apps/backend')) return false;
      return false;
    });

    await command.run();

    expect(command.warn).toHaveBeenCalledWith('App directory backend not found. Skipping.');
    expect(command.info).toHaveBeenCalledWith('Setting up frontend...');
  });

  it('should symlink shared assets', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pStr = p.toString();
      if (pStr.endsWith('core')) return true;
      if (pStr.endsWith('apps/frontend') || pStr.endsWith('apps/backend')) return true;
      if (pStr.includes('core/') && !pStr.endsWith('core')) return true;
      return false;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);

    await command.run();

    expect(command.info).toHaveBeenCalledWith('Setting up frontend...');
    expect(command.info).toHaveBeenCalledWith('Setting up backend...');
    expect(fs.removeSync).toHaveBeenCalled();
    expect(fs.symlink).toHaveBeenCalled();
    expect(command.success).toHaveBeenCalledWith('Application setup complete.');
  });

  it('should warn if source asset is missing in core', async () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const pStr = p.toString();
      if (pStr.endsWith('core')) return true;
      if (pStr.includes('apps/')) return true;
      if (pStr.endsWith('core/prisma')) return false;
      if (pStr.includes('core/') && !pStr.endsWith('core')) return true;
      return false;
    });

    await command.run();

    expect(command.warn).toHaveBeenCalledWith('Source asset prisma not found in core.');
  });

  it('should log error if removal fails with non-ENOENT', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);

    const error = new Error('Permission denied');

    (error as unknown as { code: string }).code = 'EACCES';
    vi.mocked(fs.removeSync).mockImplementationOnce(() => {
      throw error;
    });

    await command.run();

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to symlink'));
  });

  it('should ignore ENOENT error during removal', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);

    const error = new Error('Not found');
    (error as unknown as { code: string }).code = 'ENOENT';
    vi.mocked(fs.removeSync).mockImplementationOnce(() => {
      throw error;
    });

    await command.run();

    // Should not log error in outer block as it was re-thrown only for non-ENOENT
    // Wait, if it's NOT re-thrown (ENOENT), it continues to symlink.
    expect(fs.symlink).toHaveBeenCalled();
  });

  it('should re-throw non-object as error during removal', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);
    vi.mocked(fs.removeSync).mockImplementationOnce(() => {
      throw 'string fail';
    });

    await command.run();
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('string fail'));
  });

  it('should re-throw error without code during removal', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);
    vi.mocked(fs.removeSync).mockImplementationOnce(() => {
      throw new Error('No code');
    });

    await command.run();
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('No code'));
  });

  it('should log error if symlink fails with Error object', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);
    vi.mocked(fs.symlink).mockRejectedValueOnce(new Error('Symlink failed'));

    await command.run();

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to symlink'));
  });

  it('should log error if symlink fails with non-Error object', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as unknown as any);
    vi.mocked(fs.symlink).mockRejectedValueOnce('String symlink fail');

    await command.run();

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('String symlink fail'));
  });
});
