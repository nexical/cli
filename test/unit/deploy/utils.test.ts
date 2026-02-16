import { describe, it, expect, vi } from 'vitest';
import { checkCommand } from '../../../src/deploy/utils.js';
import { exec } from 'node:child_process';

vi.mock('node:child_process', () => ({
  exec: vi.fn(),
}));

describe('deploy utils', () => {
  describe('checkCommand', () => {
    it('should return true if command succeeds', async () => {
      vi.mocked(exec).mockImplementation(((
        _cmd: string,
        callback: (err: Error | null, res: { stdout: string }) => void,
      ) => {
        callback(null, { stdout: 'ok' });
        return {} as any;
      }) as unknown as typeof exec);
      expect(await checkCommand('foo')).toBe(true);
    });

    it('should return false if command fails', async () => {
      vi.mocked(exec).mockImplementation(((_cmd: string, callback: (err: Error | null) => void) => {
        callback(new Error('fail'));
        return {} as any;
      }) as unknown as typeof exec);
      expect(await checkCommand('foo')).toBe(false);
    });
  });
});
