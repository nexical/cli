import { describe, it, expect, vi, beforeEach } from 'vitest';
import { discoverCommandDirectories } from '../../../src/utils/discovery.js';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '@nexical/cli-core';

vi.mock('node:fs');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('discoverCommandDirectories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const root = path.resolve('/mock');

  it('should discover core commands', () => {
    const corePath = path.join(root, 'src/commands');
    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => p === corePath) as any);
    const dirs = discoverCommandDirectories(root);
    expect(dirs).toContain(corePath);
  });

  it('should skip directories that do not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const dirs = discoverCommandDirectories(root);
    expect(dirs).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Command directory not found'),
    );
  });

  it('should skip src commands if dist exists', () => {
    const corePath = path.join(root, 'src/commands');
    const distPath = path.join(root, 'dist/commands');
    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => {
      if (p === corePath || p === distPath) return true;
      return false;
    }) as any);
    const dirs = discoverCommandDirectories(root);
    expect(dirs).not.toContain(corePath);
  });

  it('should discover module commands', () => {
    const modulesRoot = path.join(root, 'modules');
    const mod1Path = path.join(modulesRoot, 'mod1');
    const mod1SrcCommands = path.join(mod1Path, 'src/commands');

    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return true;
      if (p === mod1SrcCommands) return true;
      return false;
    }) as any);
    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return ['mod1'] as unknown as string[];
      return [] as string[];
    }) as any);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);

    const dirs = discoverCommandDirectories(root);
    expect(dirs).toContain(mod1SrcCommands);
  });

  it('should skip already visited directories', () => {
    const corePath = path.join(root, 'src/commands');

    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => {
      if ((p as string).includes('dist')) return false;
      return true;
    }) as any);

    const modulesRoot = path.join(root, 'modules');
    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return ['core-link'] as unknown as string[];
      return [] as string[];
    }) as any);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);

    const mockModuleSrcPath = path.join(root, 'modules/core-link/src/commands');
    const originalResolve = path.resolve;
    path.resolve = vi.fn().mockImplementation((p: string) => {
      if (p === mockModuleSrcPath) return corePath;
      if (p === root || p.startsWith(root)) return p;
      return originalResolve(p);
    });

    const dirs = discoverCommandDirectories(root);
    expect(dirs.filter((d: string) => d === corePath).length).toBe(1);

    path.resolve = originalResolve;
  });

  it('should skip hidden entries and files in module search', () => {
    const modulesRoot = path.join(root, 'modules');
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) => p === modulesRoot);
    vi.mocked(fs.readdirSync).mockReturnValue(['.git', 'file.txt'] as any);
    vi.mocked(fs.statSync).mockImplementation(
      (p: fs.PathLike) =>
        ({
          isDirectory: () => !(p as string).endsWith('file.txt'),
        }) as fs.Stats,
    );

    const dirs = discoverCommandDirectories(root);
    expect(dirs).toEqual([]);
  });

  it('should discover dist commands in modules', () => {
    const modulesRoot = path.join(root, 'modules');
    const modDistPath = path.join(modulesRoot, 'mod-dist');
    const distCommands = path.join(modDistPath, 'dist/commands');

    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return true;
      if (p === distCommands) return true;
      return false;
    }) as any);
    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return ['mod-dist'] as unknown as string[];
      return [] as string[];
    }) as any);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);

    const dirs = discoverCommandDirectories(root);
    expect(dirs).toContain(distCommands);
  });

  it('should skip module with no command directories', () => {
    const modulesRoot = path.join(root, 'modules');
    // modEmpty removed as unused

    vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return true;
      // No dist, no src
      return false;
    }) as any);
    vi.mocked(fs.readdirSync).mockImplementation(((p: fs.PathLike) => {
      if (p === modulesRoot) return ['mod-empty'] as unknown as string[];
      return [] as string[];
    }) as any);
    vi.mocked(fs.statSync).mockReturnValue({ isDirectory: () => true } as unknown as fs.Stats);

    discoverCommandDirectories(root);
    expect(discoverCommandDirectories(root)).not.toContain(expect.stringContaining('mod-empty'));
  });

  describe('edge cases', () => {
    it('should handle non-TS environment', () => {
      const originalArgv = process.argv;
      const originalEnv = { ...process.env };

      Object.defineProperty(process, 'argv', { value: ['node', 'cli.js'], configurable: true });
      process.env.VITEST = 'false';
      process.env.NODE_ENV = 'production';
      const originalExecArgv = process.execArgv;
      Object.defineProperty(process, 'execArgv', { value: [], configurable: true });

      const corePath = path.join(root, 'src/commands');
      vi.mocked(fs.existsSync).mockImplementation(((p: fs.PathLike) => p === corePath) as any);

      discoverCommandDirectories(root);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('no TS loader detected'));

      process.argv = originalArgv;
      Object.assign(process.env, originalEnv);
      Object.defineProperty(process, 'execArgv', { value: originalExecArgv, configurable: true });
    });

    it('should handle readdir failure with Error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw new Error('fail');
      });
      discoverCommandDirectories(root);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Error scanning root'));
    });

    it('should handle readdir failure with String', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockImplementation(() => {
        throw 'String Fail';
      });
      discoverCommandDirectories(root);
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('String Fail'));
    });
  });
});
