import { describe, it, expect, vi } from 'vitest';
import { checkCommand, spawnAsync } from '../../../src/deploy/utils.js';
import { exec, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn(),
}));

describe('deploy utils', () => {
  describe('checkCommand', () => {
    it('should return true if command succeeds', async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: string,
        callback: (err: Error | null, res: { stdout: string }) => void,
      ) => {
        callback(null, { stdout: 'ok' });
        return {} as unknown as never;
      }) as unknown as typeof exec);
      expect(await checkCommand('foo')).toBe(true);
    });

    it('should return false if command fails', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: (err: Error | null) => void) => {
        callback(new Error('fail'));
        return {} as unknown as never;
      }) as unknown as typeof exec);
      expect(await checkCommand('foo')).toBe(false);
    });
  });

  describe('spawnAsync', () => {
    it('should resolve if command succeeds', async () => {
      const mockChild = {
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
          if (event === 'close') cb(0);
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as never);

      await expect(spawnAsync('echo', ['hello'])).resolves.toBeUndefined();
    });

    it('should reject if command fails with non-zero code', async () => {
      const mockChild = {
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
          if (event === 'close') cb(1);
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as never);

      await expect(spawnAsync('false', [])).rejects.toThrow('Command failed with code 1');
    });

    it('should reject if spawn errors', async () => {
      const mockChild = {
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
          if (event === 'error') cb(new Error('spawn error'));
        }),
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as never);

      await expect(spawnAsync('invalid', [])).rejects.toThrow('spawn error');
    });

    it('should capture output and write to log file if provided', async () => {
      const mockLogStream = {
        write: vi.fn(),
        end: vi.fn(),
      };
      vi.mocked(createWriteStream).mockReturnValue(mockLogStream as unknown as never);

      const mockChild: unknown = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1); // Fail to check output in error
        }),
        stdout: {
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('stdout data'));
          }),
        },
        stderr: {
          on: vi.fn((event, cb) => {
            if (event === 'data') cb(Buffer.from('stderr data'));
          }),
        },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as never);

      try {
        await spawnAsync('cmd', [], { logFile: 'test.log' });
      } catch (e: unknown) {
        const err = e as { output: string };
        expect(err.output).toContain('stdout data');
        expect(err.output).toContain('stderr data');
      }
      expect(mockLogStream.write).toHaveBeenCalled();
      expect(mockLogStream.end).toHaveBeenCalled();
    });

    it('should pipe to process.stdout/stderr if debug is true', async () => {
      const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
      const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

      const mockChild = {
        on: vi.fn((event: string, cb: (code: number | Error) => void) => {
          if (event === 'close') cb(0);
        }),
        stdout: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') cb(Buffer.from('debug stdout'));
          }),
        },
        stderr: {
          on: vi.fn((event: string, cb: (data: Buffer) => void) => {
            if (event === 'data') cb(Buffer.from('debug stderr'));
          }),
        },
      };
      vi.mocked(spawn).mockReturnValue(mockChild as unknown as never);

      await spawnAsync('cmd', [], { debug: true });

      expect(stdoutSpy).toHaveBeenCalledWith(expect.any(Buffer));
      expect(stderrSpy).toHaveBeenCalledWith(expect.any(Buffer));

      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    });
  });
});
