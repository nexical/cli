import { runCommand } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as git from '../../../src/utils/git.js';

const mocks = vi.hoisted(() => ({
  exec: vi.fn(),
}));

vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    runCommand: vi.fn(),
    logger: { code: vi.fn(), debug: vi.fn() },
  };
});

vi.mock('node:child_process', () => ({
  exec: mocks.exec,
}));

vi.mock('node:util', async () => {
  const actual = await vi.importActual<typeof import('node:util')>('node:util');
  return {
    ...actual,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    promisify: (fn: Function) => {
      return (...args: unknown[]) =>
        new Promise((resolve, reject) => {
          fn(...args, (err: Error | null, ...values: unknown[]) => {
            if (err) return reject(err);
            // Handle exec-like signature (stdout, stderr) -> { stdout, stderr }
            // Simple heuristic: if values.length > 1, assume explicit mapping needed?
            // Or just hardcode for our known usage (exec).
            if (values.length >= 2) {
              resolve({ stdout: values[0], stderr: values[1] });
            } else {
              resolve(values[0]);
            }
          });
        });
    },
  };
});

describe('git utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should clone repository', async () => {
    // Mock anonymous to fail to test fallback
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(new Error('Anonymous failed'), '', '');
    });

    await git.clone('http://repo.git', 'dest', { recursive: true });
    expect(runCommand).toHaveBeenCalledWith('git clone --recursive http://repo.git .', 'dest');
  });

  it('should clone repository with depth', async () => {
    // Mock anonymous to fail to test fallback
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(new Error('Anonymous failed'), '', '');
    });

    await git.clone('http://repo.git', 'dest', { depth: 1 });
    expect(runCommand).toHaveBeenCalledWith('git clone --depth 1 http://repo.git .', 'dest');
  });

  it('should try anonymous clone first', async () => {
    // Mock anonymous to succeed
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(null, 'Done', '');
    });

    await git.clone('http://repo.git', 'dest');
    expect(mocks.exec).toHaveBeenCalledWith(
      expect.stringContaining('-c credential.helper='),
      expect.any(Object),
      expect.any(Function),
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('should handle anonymous clone with empty stdout', async () => {
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(null, '', '');
    });

    await git.clone('http://repo.git', 'dest');
    expect(mocks.exec).toHaveBeenCalled();
  });

  it('should handle anonymous clone with non-Error exception', async () => {
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback('String error' as unknown as never, '', '');
    });

    await git.clone('http://repo.git', 'dest');
    expect(runCommand).toHaveBeenCalled();
  });

  it('should update submodules', async () => {
    await git.updateSubmodules('dest');
    expect(runCommand).toHaveBeenCalledWith(
      'git submodule foreach --recursive "git checkout main && git pull origin main"',
      'dest',
    );
  });

  it('should checkout orphan branch', async () => {
    await git.checkoutOrphan('branch', 'dest');
    expect(runCommand).toHaveBeenCalledWith('git checkout --orphan branch', 'dest');
  });

  it('should get remote url', async () => {
    // Mock exec to call the callback with success

    mocks.exec.mockImplementation(((cmd: string, options: unknown, callback: unknown) => {
      if (typeof options === 'function') {
        callback = options;
        options = {};
      }
      // callback(error, stdout, stderr)
      callback(null, 'https://github.com/origin.git\n', '');

      return {} as unknown as never; // exec returns a ChildProcess
    }) as unknown as never);

    const url = await git.getRemoteUrl('cwd');
    expect(url).toBe('https://github.com/origin.git');
    expect(mocks.exec).toHaveBeenCalledWith(
      'git remote get-url origin',
      { cwd: 'cwd' },
      expect.any(Function),
    );
  });

  it('should return empty string on getRemoteUrl failure', async () => {
    // Mock exec to call the callback with error

    mocks.exec.mockImplementation(((cmd: string, options: unknown, callback: unknown) => {
      if (typeof options === 'function') callback = options;
      callback(new Error('fail'), '', '');

      return {} as unknown as never;
    }) as unknown as never);

    const url = await git.getRemoteUrl('cwd');
    expect(url).toBe('');
  });

  it('should add submodule', async () => {
    // Mock anonymous to fail
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(new Error('Anonymous failed'), '', '');
    });

    await git.addSubmodule('url', 'path', 'cwd');
    expect(runCommand).toHaveBeenCalledWith('git submodule add url path', 'cwd');
  });

  it('should try anonymous submodule add first', async () => {
    // Mock anonymous to succeed
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(null, 'Done', '');
    });

    await git.addSubmodule('url', 'path', 'cwd');
    expect(mocks.exec).toHaveBeenCalledWith(
      expect.stringContaining('-c credential.helper='),
      expect.any(Object),
      expect.any(Function),
    );
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('should handle anonymous submodule add with empty stdout', async () => {
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback(null, '', '');
    });

    await git.addSubmodule('url', 'path', 'cwd');
    expect(mocks.exec).toHaveBeenCalled();
  });

  it('should handle anonymous submodule add with non-Error exception', async () => {
    mocks.exec.mockImplementationOnce((_cmd, _options, callback) => {
      callback('String error' as unknown as never, '', '');
    });

    await git.addSubmodule('url', 'path', 'cwd');
    expect(runCommand).toHaveBeenCalled();
  });
});

it('should add all files', async () => {
  await git.addAll('cwd');
  expect(runCommand).toHaveBeenCalledWith('git add -A', 'cwd');
});

it('should commit', async () => {
  await git.commit('msg', 'cwd');
  expect(runCommand).toHaveBeenCalledWith('git commit -m "msg"', 'cwd');
});

it('should delete branch', async () => {
  await git.deleteBranch('branch', 'cwd');
  expect(runCommand).toHaveBeenCalledWith('git branch -D branch', 'cwd');
});

it('should rename branch', async () => {
  await git.renameBranch('branch', 'cwd');
  expect(runCommand).toHaveBeenCalledWith('git branch -m branch', 'cwd');
});

it('should remove remote', async () => {
  await git.removeRemote('origin', 'cwd');
  expect(runCommand).toHaveBeenCalledWith('git remote remove origin', 'cwd');
});

it('should check if branch exists', async () => {
  // Mock success

  mocks.exec.mockImplementation(((cmd: string, options: unknown, callback: unknown) => {
    if (typeof options === 'function') callback = options;
    callback(null, '', '');

    return {} as unknown as never;
  }) as unknown as never);

  expect(await git.branchExists('branch', 'cwd')).toBe(true);
  expect(mocks.exec).toHaveBeenCalledWith(
    'git show-ref --verify --quiet refs/heads/branch',
    { cwd: 'cwd' },
    expect.any(Function),
  );

  // Mock failure

  mocks.exec.mockImplementation(((cmd: string, options: unknown, callback: unknown) => {
    if (typeof options === 'function') callback = options;
    callback(new Error('fail'), '', '');

    return {} as unknown as never;
  }) as unknown as never);

  expect(await git.branchExists('branch', 'cwd')).toBe(false);
});
