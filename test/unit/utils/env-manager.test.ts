import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import fs from 'fs-extra';
import glob from 'fast-glob';
import { EnvManager, Logger } from '../../../src/utils/env-manager.js';

vi.mock('fs-extra');
vi.mock('fast-glob');

describe('EnvManager', () => {
  let logger: Logger;
  let envManager: EnvManager;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.resetAllMocks();
    logger = {
      info: vi.fn() as unknown as never,
      warn: vi.fn() as unknown as never,
      error: vi.fn() as unknown as never,
    };
    envManager = new EnvManager(logger);
  });

  describe('ensureEnv', () => {
    it('should skip if no .env.example files are found', async () => {
      vi.mocked(glob).mockResolvedValue([] as unknown as never);

      await envManager.ensureEnv(projectRoot);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('No .env.example files found'),
      );
      expect(fs.pathExists).not.toHaveBeenCalled();
    });

    it('should create root .env from .env.example if root .env is missing', async () => {
      vi.mocked(glob).mockResolvedValue([
        '.env.example',
        'apps/api/.env.example',
      ] as unknown as never);
      vi.mocked(fs.pathExists).mockResolvedValue(false as never);
      vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
        const pathStr = p as string;
        if (typeof pathStr !== 'string') return '';
        if (pathStr.endsWith('apps/api/.env.example'))
          return 'API_KEY=123\nDB_URL=postgres://localhost';
        if (pathStr.endsWith('.env.example'))
          return 'APP_NAME=test-app\n# Comment\nNODE_ENV=development';
        return '';
      }) as unknown as never;

      await envManager.ensureEnv(projectRoot);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(projectRoot, '.env'),
        expect.stringContaining('APP_NAME=test-app'),
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(projectRoot, '.env'),
        expect.stringContaining('API_KEY=123'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Generated root .env from 2 files'),
      );
    });

    it('should append missing variables to existing root .env', async () => {
      vi.mocked(glob).mockResolvedValue(['.env.example'] as unknown as never);
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
        const pathStr = p as string;
        if (typeof pathStr !== 'string') return '';
        if (pathStr === path.join(projectRoot, '.env')) return 'APP_NAME=existing-app\n';
        if (pathStr.endsWith('.env.example')) return 'APP_NAME=test-app\nNEW_VAR=secret';
        return '';
      }) as unknown as never;

      await envManager.ensureEnv(projectRoot);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenContent = writeCall[1] as string;

      expect(writtenContent).toContain('APP_NAME=existing-app');
      expect(writtenContent).toContain('NEW_VAR=secret');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Synchronized 1 missing variables'),
      );
    });

    it('should do nothing if root .env is up to date', async () => {
      vi.mocked(glob).mockResolvedValue(['.env.example'] as unknown as never);
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.readFile).mockImplementation(async (p: unknown) => {
        const pathStr = p as string;
        if (typeof pathStr !== 'string') return '';
        if (pathStr === path.join(projectRoot, '.env')) return 'VAR=val\n';
        if (pathStr.endsWith('.env.example')) return 'VAR=val';
        return '';
      }) as unknown as never;

      await envManager.ensureEnv(projectRoot);

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Root .env is up to date'));
    });
  });

  describe('ensureSymlinks', () => {
    it('should warn if root .env is missing', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(false as never);

      await envManager.ensureSymlinks(projectRoot, [
        { name: 'app1', provider: 'cloudflare' } as unknown as never,
      ]);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Root .env missing'));
    });

    it('should create symlinks for apps not in root', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p: unknown) => {
        if (p === path.join(projectRoot, '.env')) return true;
        return false; // App .env doesn't exist
      }) as unknown as never;

      const apps = [
        { name: 'root-app', target: '.', provider: 'cloudflare' },
        { name: 'sub-app', target: 'apps/sub-app', provider: 'cloudflare' },
      ];

      await envManager.ensureSymlinks(projectRoot, apps as unknown as never);

      expect(fs.symlink).toHaveBeenCalledTimes(1);
      expect(fs.symlink).toHaveBeenCalledWith(
        path.join('..', '..', '.env'),
        path.join(projectRoot, 'apps/sub-app', '.env'),
      );
    });

    it('should update existing symlink if it points to wrong target', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as unknown as never);
      vi.mocked(fs.readlink).mockResolvedValue('/wrong/path/.env' as unknown as never);

      const apps = [{ name: 'sub-app', target: 'apps/sub-app', provider: 'cloudflare' }];

      await envManager.ensureSymlinks(projectRoot, apps as unknown as never);

      expect(fs.remove).toHaveBeenCalled();
      expect(fs.symlink).toHaveBeenCalled();
    });

    it('should remove existing file if it is not a symlink and replace with symlink', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => false } as unknown as never);

      const apps = [{ name: 'sub-app', target: 'apps/sub-app', provider: 'cloudflare' }];

      await envManager.ensureSymlinks(projectRoot, apps as unknown as never);

      expect(fs.remove).toHaveBeenCalled();
      expect(fs.symlink).toHaveBeenCalled();
    });

    it('should skip if symlink is already correct', async () => {
      vi.mocked(fs.pathExists).mockResolvedValue(true as never);
      vi.mocked(fs.lstat).mockResolvedValue({ isSymbolicLink: () => true } as unknown as never);
      // Path.resolve handles relative links
      vi.mocked(fs.readlink).mockResolvedValue('../../.env' as unknown as never);

      const apps = [{ name: 'sub-app', target: 'apps/sub-app', provider: 'cloudflare' }];

      await envManager.ensureSymlinks(projectRoot, apps as unknown as never);

      expect(fs.symlink).not.toHaveBeenCalled();
    });

    it('should handle errors when creating symlinks', async () => {
      vi.mocked(fs.pathExists).mockImplementation(async (p: unknown) => {
        if (p === path.join(projectRoot, '.env')) return true;
        return false;
      }) as unknown as never;
      vi.mocked(fs.symlink).mockRejectedValue(new Error('unlinkable') as never);

      const apps = [{ name: 'sub-app', target: 'apps/sub-app', provider: 'cloudflare' }];

      await envManager.ensureSymlinks(projectRoot, apps as unknown as never);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create symlink for sub-app: unlinkable'),
      );
    });
  });

  describe('parseEnv (via ensureEnv side effects)', () => {
    it('should handle quoted values in .env', async () => {
      vi.mocked(glob).mockResolvedValue(['.env.example'] as unknown as never);
      vi.mocked(fs.pathExists).mockResolvedValue(false as never);
      vi.mocked(fs.readFile).mockResolvedValue(
        'KEY1="double quotes"\nKEY2=\'single quotes\'\nKEY3=no quotes' as unknown as never,
      );

      await envManager.ensureEnv(projectRoot);

      const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain('KEY1=double quotes');
      expect(writtenContent).toContain('KEY2=single quotes');
      expect(writtenContent).toContain('KEY3=no quotes');
    });
  });
});
