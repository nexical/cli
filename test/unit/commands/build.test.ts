import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import BuildCommand from '../../../src/commands/build.js';
import fs from 'fs-extra';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import { NexicalConfig } from '../../../src/deploy/types.js';
import process from 'node:process';
import { EnvManager } from '../../../src/utils/env-manager.js';
import SetupCommand from '../../../src/commands/setup.js';
import { runCommand } from '@nexical/cli-core';

vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    runCommand: vi.fn().mockResolvedValue(undefined),
    logger: {
      code: vi.fn(),
      debug: vi.fn(),
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  };
});
vi.mock('fs-extra');
vi.mock('../../../src/deploy/config-manager.js');
vi.mock('../../../src/utils/env-manager.js');
vi.mock('../../../src/commands/setup.js', () => ({
  __esModule: true,
  default: class {
    async init() {}
    async run() {}
  },
}));
vi.mock('dotenv', () => ({
  default: {
    config: vi.fn(),
  },
}));

describe('BuildCommand', () => {
  let command: BuildCommand;

  beforeEach(async () => {
    vi.clearAllMocks();
    command = new BuildCommand({}, { rootDir: '/mock/root' });

    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});

    // Mock ConfigManager
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'test' },
          app2: { target: 'apps/app2', provider: 'test' },
        },
      },
    } as NexicalConfig);

    // Mock fs-extra
    vi.mocked(fs.pathExists).mockImplementation(
      () => Promise.resolve(true) as unknown as Promise<boolean>,
    );
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { build: 'some-build-cmd' },
    } as unknown as { scripts: { build: string } });

    vi.spyOn(SetupCommand.prototype, 'init').mockResolvedValue(undefined);
    vi.spyOn(SetupCommand.prototype, 'run').mockResolvedValue(undefined);

    await command.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should run environment sync and setup', async () => {
    await command.run({});

    expect(EnvManager.prototype.ensureEnv).toHaveBeenCalledWith('/mock/root');
    expect(SetupCommand.prototype.init).toHaveBeenCalled();
    expect(SetupCommand.prototype.run).toHaveBeenCalled();
  });

  it('should build all apps from configuration', async () => {
    await command.run({});

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(runCommand).toHaveBeenCalledWith('npm run build', expect.stringContaining('apps/app1'));
    expect(runCommand).toHaveBeenCalledWith('npm run build', expect.stringContaining('apps/app2'));
  });

  it('should filter apps with --apps', async () => {
    await command.run({ apps: 'app1' });

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith('npm run build', expect.stringContaining('apps/app1'));
  });

  it('should error if requested app is missing', async () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);
    await command.run({ apps: 'missing' });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('not found in nexical.yaml'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('should warn and skip if no build script is found', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({ scripts: {} });

    await command.run({});

    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('No "build" script found'));
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('should warn and skip if package.json is missing', async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false as never);

    await command.run({});

    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('package.json not found'));
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('should handle build command errors', async () => {
    vi.mocked(runCommand).mockRejectedValue(new Error('build error'));
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    await command.run({ apps: 'app1' });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to build app1: build error'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);

    // Test non-Error object
    vi.mocked(runCommand).mockRejectedValue('string error');
    await command.run({ apps: 'app1' });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to build app1: string error'),
    );

    exitSpy.mockRestore();
  });
});
