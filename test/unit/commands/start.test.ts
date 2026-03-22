import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { runCommand } from '@nexical/cli-core';
import { ConfigManager } from '../../../src/deploy/config-manager.js';
import fs from 'fs-extra';
import { spawn, ChildProcess } from 'node:child_process';
import { EnvManager } from '../../../src/utils/env-manager.js';
import StartCommand from '../../../src/commands/start.js';
import { NexicalConfig } from '../../../src/deploy/types.js';

vi.mock('@nexical/cli-core', () => ({
  BaseCommand: class {
    cli: unknown;
    globalOptions: unknown;
    projectRoot: string = '/test/project';
    constructor(cli: unknown, options: unknown) {
      this.cli = cli;
      this.globalOptions = options;
    }
    init = vi.fn().mockResolvedValue(undefined);
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
    success = vi.fn();
  },
  runCommand: vi.fn(),
}));

interface MockChild {
  stdout: { on: (event: string, cb: (data: unknown) => void) => void };
  stderr: { on: (event: string, cb: (data: unknown) => void) => void };
  on: (event: string, cb: (code: number | null) => void) => void;
  kill?: () => void;
}

vi.mock('../../../src/deploy/config-manager.js');
vi.mock('../../../src/utils/env-manager.js');
vi.mock('node:child_process');
vi.mock('fs-extra');
vi.mock('kill-port', () => ({
  default: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../src/commands/setup.js', () => ({
  __esModule: true,
  default: class {
    init = vi.fn().mockResolvedValue(undefined);
    run = vi.fn().mockResolvedValue(undefined);
  },
}));

describe('StartCommand', () => {
  let command: StartCommand;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.resetAllMocks();
    command = new StartCommand(
      {} as unknown as never,
      { rootDir: projectRoot } as unknown as never,
    );
    (command as unknown as { projectRoot: string }).projectRoot = projectRoot;
  });

  it('should initialize and start applications', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'cloudflare', dev: { port: 3000 } },
        },
      },
    };

    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockImplementation(async (p: unknown) => {
      if ((p as string).endsWith('package.json')) return true;
      return false;
    }) as unknown as never;
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'astro dev' },
    } as unknown as NexicalConfig);

    const mockChild: MockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    await command.run({});

    expect(EnvManager.prototype.ensureEnv).toHaveBeenCalledWith(projectRoot);
    expect(runCommand).toHaveBeenCalledWith('npm install', projectRoot);
    expect(ConfigManager.prototype.load).toHaveBeenCalled();
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['run', 'dev']),
      expect.objectContaining({
        cwd: path.resolve(projectRoot, 'apps/app1'),
      }),
    );
  });

  it('should skip init if --skip-init is provided', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: {} },
    } as unknown as NexicalConfig);

    await command.run({ skipInit: true });

    expect(runCommand).not.toHaveBeenCalledWith('npm install', expect.anything());
  });

  it('should filter applications if --apps is provided', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'cloudflare' },
          app2: { target: 'apps/app2', provider: 'cloudflare' },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'dev' },
    } as unknown as NexicalConfig);
    vi.mocked(spawn).mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    } as unknown as never);

    await command.run({ apps: 'app1' });

    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      'npm',
      expect.anything(),
      expect.objectContaining({
        cwd: path.resolve(projectRoot, 'apps/app1'),
      }),
    );
  });

  it('should handle dependency install failure', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: {} },
    } as unknown as NexicalConfig);
    vi.mocked(runCommand).mockImplementation(async (cmd: string) => {
      if (cmd === 'npm install') throw new Error('npm fail');
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as never);

    await command.run({});

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to install dependencies: npm fail'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should handle optional setup failures (db, email)', async () => {
    const mockConfig = { deploy: { apps: {} } };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(runCommand).mockImplementation(async (cmd: string) => {
      if (cmd === 'npm run db:up' || cmd === 'npm run email:up') throw new Error('optional fail');
    });

    await command.run({});

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start database: optional fail'),
    );
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start email server: optional fail'),
    );
  });

  it('should error if filtered app is not found', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { app1: {} } },
    } as unknown as NexicalConfig);

    await command.run({ apps: 'missing' });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('not found in nexical.yaml: missing'),
    );
  });

  it('should skip app if package.json is missing', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'cloudflare' },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(false as never); // package.json missing

    await command.run({});

    expect(spawn).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('package.json not found'));
  });

  it('should handle non-Error objects in install catch', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: {} },
    } as unknown as NexicalConfig);
    vi.mocked(runCommand).mockImplementation(async (cmd: string) => {
      if (cmd === 'npm install') throw 'Install Failure String'; // Simulate non-Error rejection
    });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as never);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to install dependencies: Install Failure String'),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('should skip app if dev script is missing in package.json', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: { target: 'apps/app1', provider: 'cloudflare' },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({ scripts: {} } as unknown as NexicalConfig); // No dev script

    await command.run({});

    expect(spawn).not.toHaveBeenCalled();
    expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('No "dev" script found'));
  });

  it('should handle app process errors and non-zero exits', async () => {
    const mockConfig = { deploy: { apps: { app1: { provider: 'cloudflare' } } } };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'dev' },
    } as unknown as NexicalConfig);

    let errorCallback: unknown;
    let exitCallback: unknown;
    const mockChild: MockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn((event, cb) => {
        if (event === 'error') (errorCallback as (err: Error) => void) = cb as (err: Error) => void;
        if (event === 'exit')
          (exitCallback as (code: number) => void) = cb as (code: number) => void;
      }),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    await command.run({});

    (errorCallback as (err: Error) => void)(new Error('app crash'));
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start app1: app crash'),
    );

    (exitCallback as (code: number) => void)(1);
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('app1 exited with code 1'));
  });

  it('should handle process signals for cleanup', async () => {
    const mockConfig = { deploy: { apps: { app1: { provider: 'cloudflare' } } } };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'dev' },
    } as unknown as NexicalConfig);

    const mockChild: MockChild = {
      kill: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    // Mock process.on to capture the listener
    const listeners: Record<string, () => void> = {};
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event: unknown, cb: unknown) => {
      listeners[event as string] = cb as () => void;
      return process;
    });

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as unknown as never);

    await command.run({});

    // Trigger SIGINT
    if (listeners['SIGINT']) listeners['SIGINT']();

    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(exitSpy).toHaveBeenCalled();

    onSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should handle app name resolution in env mapping', async () => {
    const mockConfig = {
      deploy: {
        apps: {
          app1: {
            target: 'apps/app1',
            provider: 'cloudflare',
            dev: { port: 3000 },
            env: { OTHER_PORT: '{{apps.app1.dev.port}}' },
          },
        },
      },
    };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'dev' },
    } as unknown as NexicalConfig);
    const mockChild: MockChild = { stdout: { on: vi.fn() }, stderr: { on: vi.fn() }, on: vi.fn() };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    await command.run({});

    expect(spawn).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        env: expect.objectContaining({ OTHER_PORT: '3000' }),
      }),
    );
  });

  it('should handle stdout and stderr data', async () => {
    const mockConfig = { deploy: { apps: { app1: { provider: 'cloudflare' } } } };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { dev: 'dev' },
    } as unknown as NexicalConfig);

    let stdoutCallback: unknown;
    let stderrCallback: unknown;
    const mockChild: MockChild = {
      stdout: {
        on: vi.fn((event, cb) => {
          if (event === 'data')
            (stdoutCallback as (data: Buffer) => void) = cb as (data: Buffer) => void;
        }),
      },
      stderr: {
        on: vi.fn((event, cb) => {
          if (event === 'data')
            (stderrCallback as (data: Buffer) => void) = cb as (data: Buffer) => void;
        }),
      },
      on: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    const stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((() => true) as unknown as never);
    const stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as unknown as never);

    await command.run({});

    (stdoutCallback as (data: Buffer) => void)(Buffer.from('hello\nworld'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('hello'));
    expect(stdoutSpy).toHaveBeenCalledWith(expect.stringContaining('world'));

    (stderrCallback as (data: Buffer) => void)(Buffer.from('error\nboom'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('error'));
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('boom'));

    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('should handle non-Error objects in DB/Email catch', async () => {
    const mockConfig = { deploy: { apps: {} } };
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue(
      mockConfig as unknown as NexicalConfig,
    );
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(runCommand).mockImplementation(async (cmd: string) => {
      if (cmd === 'npm run db:up') throw 'DB fail string';
      if (cmd === 'npm run email:up') throw 'Email fail string';
    });
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start database: DB fail string'),
    );
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to start email server: Email fail string'),
    );
  });

  it('should error if no applications are found after filtering', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { a: {} } },
    } as unknown as NexicalConfig);
    await command.run({ apps: 'b' }); // b not in config
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('No applications found to start'),
    );
  });

  it('should error if no processes were started', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { a: {} } },
    } as unknown as NexicalConfig);
    vi.mocked(fs.pathExists).mockResolvedValue(false as never); // package.json missing for all
    await command.run({});
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('No processes were started'),
    );
  });

  it('should handle child process error and non-zero exit', async () => {
    vi.mocked(ConfigManager.prototype.load).mockResolvedValue({
      deploy: { apps: { a: { target: 'apps/a' } } },
    } as unknown as NexicalConfig);
    vi.mocked(fs.pathExists).mockResolvedValue(true as never);
    vi.mocked(fs.readJson).mockResolvedValue({ scripts: { dev: 'node dev.js' } });

    const mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'error') cb(new Error('Spawn Fail'));
        if (event === 'exit') cb(1);
      }),
      kill: vi.fn(),
    };
    vi.mocked(spawn).mockReturnValue(mockChild as unknown as ChildProcess);

    await command.run({});
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Spawn Fail'));
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('a exited with code 1'));
  });
});
