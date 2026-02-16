import { describe, it, expect, vi } from 'vitest';
import * as git from '../../../src/utils/git.js';
import { runCommand } from '@nexical/cli-core';

vi.mock('@nexical/cli-core', () => ({
  runCommand: vi.fn(),
  logger: {
    debug: vi.fn(),
  },
}));

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

describe('git utils', () => {
  it('should call git clone', async () => {
    await git.clone('url', 'dest');
    expect(runCommand).toHaveBeenCalledWith(expect.stringContaining('git clone'), 'dest');
  });

  it('should call renameRemote', async () => {
    await git.renameRemote('old', 'new', 'cwd');
    expect(runCommand).toHaveBeenCalledWith('git remote rename old new', 'cwd');
  });

  it('should check if branch exists', async () => {
    const { exec } = await import('node:child_process');
    vi.mocked(exec).mockImplementation(((
      _cmd: string,
      _opts: any,
      callback: (err: Error | null, res: { stdout: string }) => void,
    ) => {
      callback(null, { stdout: '' });
      return {} as any;
    }) as any);
    expect(await git.branchExists('main', 'cwd')).toBe(true);

    vi.mocked(exec).mockImplementation(((
      _cmd: string,
      _opts: any,
      callback: (err: Error | null) => void,
    ) => {
      callback(new Error());
      return {} as any;
    }) as any);
    expect(await git.branchExists('main', 'cwd')).toBe(false);
  });
});
