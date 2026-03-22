import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import fs from 'node:fs/promises';
import { NexicalConfig } from '../../../src/deploy/types.js';
import { logger } from '@nexical/cli-core';

vi.mock('node:fs/promises');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('ConfigManager', () => {
  let manager: ConfigManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new ConfigManager('/mock');
  });

  it('should load config', async () => {
    const mockConfig: NexicalConfig = {
      deploy: {
        apps: {
          backend: { provider: 'railway' },
        },
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue(
      'deploy:\n  apps:\n    backend:\n      provider: railway',
    );
    const config = await manager.load();
    expect(config).toEqual(mockConfig);
  });

  it('should throw error on invalid configuration', async () => {
    // Missing required provider
    vi.mocked(fs.readFile).mockResolvedValue('deploy:\n  apps:\n    backend:\n      foo: bar');
    await expect(manager.load()).rejects.toThrow('Configuration validation failed.');
    expect(logger.error).toHaveBeenCalled();
  });

  it('should return empty object on ENOENT error', async () => {
    const error = { code: 'ENOENT' };
    vi.mocked(fs.readFile).mockRejectedValue(error);
    const config = await manager.load();
    expect(config).toEqual({});
  });

  it('should throw on other load errors', async () => {
    vi.mocked(fs.readFile).mockRejectedValue(new Error('crash'));
    await expect(manager.load()).rejects.toThrow('crash');
  });

  it('should save config', async () => {
    const mockConfig: NexicalConfig = {
      deploy: {
        apps: {
          frontend: {
            provider: 'cloudflare',
          },
        },
      },
    };
    await manager.save(mockConfig);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('provider: cloudflare'),
      'utf-8',
    );
  });

  it('should check existence', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    expect(await manager.exists()).toBe(true);

    vi.mocked(fs.access).mockRejectedValue(new Error());
    expect(await manager.exists()).toBe(false);
  });
});
