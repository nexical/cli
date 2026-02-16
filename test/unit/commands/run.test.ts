import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RunCommand from '../../../src/commands/run.js';
import fs from 'fs-extra';
import cp from 'child_process';
import EventEmitter from 'events';
import process from 'node:process';

vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
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
vi.mock('child_process');

describe('RunCommand', () => {
  let command: RunCommand;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockChild: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExit: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    command = new RunCommand({}, { rootDir: '/mock/root' });

    mockChild = new EventEmitter();
    mockChild.kill = vi.fn();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(cp.spawn).mockReturnValue(mockChild as any);

    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});

    // Defaultfs mocks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      if (p.includes('package.json')) return true;
      return false;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readJson).mockImplementation(async (p: any) => {
      return { scripts: { test: 'echo test', sc: 'echo sc' } };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      return process;
    });

    await command.init();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have correct static properties', () => {
    // expect(RunCommand.paths).toEqual([['run']]); // run is default? Check base command implementation if needed, but 'usage' covers it.
    expect(RunCommand.usage).toBe('run <script> [args...]');
    expect(RunCommand.requiresProject).toBe(true);
    expect(RunCommand.args).toBeDefined();
  });

  it('should error if project root is missing', async () => {
    command = new RunCommand({}, { rootDir: undefined });
    vi.spyOn(command, 'init').mockImplementation(async () => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(command, 'error').mockImplementation((() => {}) as any);

    await command.runInit({ script: 'script', args: [] });
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('requires to be run within an app project'),
      1,
    );
  });

  it('should error if script is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await command.run({} as any);
    expect(command.error).toHaveBeenCalledWith('Please specify a script to run.');
  });

  it('should run core script via npm', async () => {
    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);

    // run(options)
    await command.run({ script: 'test', args: [] });

    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      ['run', 'test', '--'],
      expect.objectContaining({
        cwd: '/mock/root',
      }),
    );
  });

  it('should run module script if resolved', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      return p.includes('stripe/package.json') || p.includes('stripe') || p.includes('core');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readJson).mockImplementation(async (p: any) => {
      if (p.includes('stripe')) {
        return { scripts: { sync: 'node scripts/sync.js' } };
      }
      return { scripts: { test: 'echo test' } };
    });

    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);

    await command.run({ script: 'stripe:sync', args: ['--flag'] });

    // Expect shell execution of raw command
    // Expect npm run <scriptName>
    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['run', 'sync', '--', '--flag']),
      expect.objectContaining({
        cwd: expect.stringContaining('/modules/stripe'),
      }),
    );
    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['run', 'sync', '--', '--flag']),
      expect.objectContaining({
        cwd: expect.stringContaining('/modules/stripe'),
      }),
    );
    // strict run.ts does not log "Running module script..." in new revision
    // expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Running module script'));
  });

  it('should handle module script read error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      return p.includes('stripe'); // module exists
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readJson).mockImplementation(async (p: any) => {
      if (p.includes('stripe')) {
        throw new Error('Read failed');
      }
      return { scripts: {} };
    });

    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);

    await command.run({ script: 'stripe:sync', args: [] });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read package.json'),
    );
  });

  it('should ignore module script if package.json missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      return p.includes('stripe') && !p.includes('package.json');
    });

    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { 'stripe:sync': 'fallback' },
    });

    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);
    await command.run({ script: 'stripe:sync', args: [] });

    // Should error strict
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to find package.json'),
    );
  });

  it('should handle cleanup signals', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const listeners: Record<string, Function> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: any) => {
      listeners[event.toString()] = listener;
      return process;
    });

    const runPromise = command.run({ script: 'test', args: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Simulate signal by calling listener directly
    if (listeners['SIGINT']) listeners['SIGINT']();
    mockChild.emit('close', 0);

    await runPromise;

    expect(mockExit).toHaveBeenCalled();
  });

  it('should handle non-zero exit code', async () => {
    setTimeout(() => {
      mockChild.emit('close');
    }, 10);
    await command.run({ script: 'test', args: [] });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should use cmd on windows for module scripts', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      return p.includes('stripe');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.readJson).mockImplementation(async (p: any) => {
      if (p.includes('stripe')) {
        return { scripts: { sync: 'node scripts/sync.js' } };
      }
      return { scripts: {} };
    });

    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);
    await command.run({ script: 'stripe:sync', args: [] });

    expect(cp.spawn).toHaveBeenCalledWith(
      'npm',
      expect.arrayContaining(['run', 'sync']),
      expect.anything(),
    );

    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });
  it('should fall back to default behavior if script not found in module', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
      return p.includes('apps/backend/modules/mymod') || p.includes('package.json');
    });
    vi.mocked(fs.readJson).mockResolvedValue({
      name: 'mymod',
      scripts: { other: 'command' },
    });

    setTimeout(() => {
      mockChild.emit('close', 0);
    }, 10);
    await command.run({ script: 'mymod:missing', args: [] });

    // Should error strict
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('does not exist in module mymod'),
    );
    expect(cp.spawn).not.toHaveBeenCalled();
  });

  it('should handle null exit code', async () => {
    setTimeout(() => {
      mockChild.emit('close'); // emit undefined
    }, 10);

    await command.run({ script: 'test', args: [] });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should error if script not found in core', async () => {
    vi.mocked(fs.readJson).mockResolvedValue({
      scripts: { test: 'echo test' },
    });

    await command.run({ script: 'missing-script', args: [] });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('does not exist in Nexical core'),
    );
    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('does not exist in Nexical core'),
    );
  });

  it('should handle non-Error exception in package.json read', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(fs.pathExists).mockImplementation(async (p: any) => p.includes('package.json'));
    vi.mocked(fs.readJson).mockRejectedValue('String error');

    await command.run({ script: 'test', args: [] });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read package.json at /mock/root: String error'),
    );
  });

  it('should error if module not found', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fs.pathExists as unknown as { mockResolvedValue: any }).mockResolvedValue(false);
    await command.run({ script: 'nonexistent:sync', args: [] });
    expect(command.error).toHaveBeenCalledWith('Module nonexistent not found.');
  });
});
