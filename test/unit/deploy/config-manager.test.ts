import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import fs from 'node:fs/promises';
import { NexicalConfig } from '../../../src/deploy/types.js';

vi.mock('node:fs/promises');

describe('ConfigManager', () => {
  let manager: ConfigManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new ConfigManager('/mock');
  });

  it('should load config', async () => {
    const mockConfig: NexicalConfig = {
      deploy: {
        backend: {
          provider: 'railway',
        },
      },
    };
    vi.mocked(fs.readFile).mockResolvedValue('deploy:\n  backend:\n    provider: railway');
    const config = await manager.load();
    expect(config).toEqual(mockConfig);
  });

  it('should return empty object if config missing', async () => {
    const error = new Error('not found');
    (error as unknown as { code: string }).code = 'ENOENT';
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
        frontend: {
          provider: 'cloudflare',
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
