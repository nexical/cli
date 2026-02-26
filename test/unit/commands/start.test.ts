import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import StartCommand from '../../../src/commands/start.js';
import fs from 'fs-extra';
import cp from 'child_process';
import EventEmitter from 'events';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import { NexicalConfig } from '../../../src/deploy/types.js';
import process from 'node:process';
import type { ChildProcess } from 'node:child_process';

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
vi.mock('child_process');
vi.mock('../../../src/deploy/config-manager.js');

describe('StartCommand', () => {
  let command: StartCommand;
  let mockChild: EventEmitter & { kill: Mock; stdout: EventEmitter; stderr: EventEmitter };

  beforeEach(async () => {
    vi.clearAllMocks();
    command = new StartCommand({}, { rootDir: '/mock/root' });

    mockChild = new EventEmitter() as unknown as EventEmitter & {
      kill: Mock;
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    mockChild.kill = vi.fn();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    vi.mocked(cp.spawn).mockReturnValue(mockChild as unknown as ChildProcess);

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
    vi.mocked(fs.pathExists).mockImplementation(() => Promise.resolve(true));
    vi.mocked(fs.readJson).mockResolvedValue({ scripts: { dev: 'some-cmd' } });

    // Mock process.env.NODE_ENV
    process.env.NODE_ENV = 'test';

    await command.init();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should run init phase by default', async () => {
    await command.run({});

    const { runCommand } = await import('@nexical/cli-core');
    expect(runCommand).toHaveBeenCalledWith('npm install', '/mock/root');
    expect(runCommand).toHaveBeenCalledWith('npm run db:up', '/mock/root');
  });

  it('should skip init phase with --skip-init', async () => {
    await command.run({ skipInit: true });

    const { runCommand } = await import('@nexical/cli-core');
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('should start all apps from configuration', async () => {
    await command.run({ skipInit: true });

    expect(cp.spawn).toHaveBeenCalledTimes(2);
    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev'],
      expect.objectContaining({ cwd: expect.stringContaining('apps/app1') }),
    );
    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev'],
      expect.objectContaining({ cwd: expect.stringContaining('apps/app2') }),
    );
  });

  it('should filter apps with --apps', async () => {
    await command.run({ skipInit: true, apps: 'app1' });

    expect(cp.spawn).toHaveBeenCalledTimes(1);
    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'dev'],
      expect.objectContaining({ cwd: expect.stringContaining('apps/app1') }),
    );
  });

  it('should warn and skip if no dev script is found', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({ scripts: {} });

    await command.run({ skipInit: true });

    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('No "dev" script found'));
    expect(cp.spawn).not.toHaveBeenCalled();
  });
});
