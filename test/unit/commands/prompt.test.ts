import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PromptCommand from '../../../src/commands/prompt.js';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';
import { PromptRunner } from '@nexical/ai';
import { logger } from '@nexical/cli-core';

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
vi.mock('yaml');
vi.mock('@nexical/ai');

describe('PromptCommand', () => {
  let command: PromptCommand;
  const projectRoot = '/test/project';

  beforeEach(() => {
    vi.clearAllMocks();
    command = new PromptCommand({});
    (command as unknown as { projectRoot: string }).projectRoot = projectRoot;

    vi.spyOn(command, 'error').mockImplementation(() => {});

    // Default fs mocks
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockResolvedValue(false);
    vi.mocked(
      fs.readFile as unknown as (p: string, e: string) => Promise<string>,
    ).mockResolvedValue('');

    // Default PromptRunner mock
    vi.mocked(PromptRunner.run).mockResolvedValue(0);

    // Mock process.exit
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Process.exit(${code})`);
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should have correct metadata', () => {
    expect(PromptCommand.usage).toBeDefined();
    expect(PromptCommand.description).toBeDefined();
    expect(PromptCommand.requiresProject).toBe(true);
    expect(PromptCommand.args).toBeDefined();
  });

  it('should run prompt with default options', async () => {
    await command.run({ promptName: 'test-prompt' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        promptName: 'test-prompt',
        models: ['gemini-3-flash-preview', 'gemini-3-pro-preview'],
        interactive: false,
      }),
    );
  });

  it('should handle interactive flag', async () => {
    await command.run({ promptName: 'test-prompt', interactive: true });
    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        interactive: true,
      }),
    );

    vi.clearAllMocks();
    await command.run({ promptName: 'test-prompt', i: true });
    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        interactive: true,
      }),
    );

    vi.clearAllMocks();
    await command.run({ promptName: 'test-prompt', args: ['--interactive'] });
    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        interactive: true,
      }),
    );
  });

  it('should handle custom models', async () => {
    await command.run({ promptName: 'test-prompt', models: 'model1, model2 ' });
    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        models: ['model1', 'model2'],
      }),
    );
  });

  it('should include generator agents prompts if they exist', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => {
        return (p as string).includes('packages/generator/prompts/agents');
      },
    );

    await command.run({ promptName: 'test-prompt' });

    const call = vi.mocked(PromptRunner.run).mock.calls[0][0];
    expect(call?.promptDirs).toHaveLength(2);
    expect(call?.promptDirs).toContain(path.join(projectRoot, 'prompts'));
    expect(call?.promptDirs).toContain(path.join(projectRoot, 'packages/generator/prompts/agents'));
  });

  it('should resolve frontend module context', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => {
        return (p as string).includes('apps/frontend/modules/test-module');
      },
    );

    await command.run({ promptName: 'test-prompt', module: 'test-module' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({
          module_name: 'test-module',
          module_type: 'frontend',
          module_root: path.join(projectRoot, 'apps/frontend/modules/test-module'),
        }),
      }),
    );
  });

  it('should resolve backend module context', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => {
        return (p as string).includes('apps/backend/modules/test-module');
      },
    );

    await command.run({ promptName: 'test-prompt', m: 'test-module' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.objectContaining({
          module_name: 'test-module',
          module_type: 'backend',
          module_root: path.join(projectRoot, 'apps/backend/modules/test-module'),
        }),
      }),
    );
  });

  it('should fail if module not found', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockResolvedValue(false);

    await command.run({ promptName: 'test-prompt', module: 'missing-module' });

    expect(command.error).toHaveBeenCalledWith(
      expect.stringContaining("Module 'missing-module' not found"),
    );
    expect(PromptRunner.run).not.toHaveBeenCalled();
  });

  it('should load AI config from nexical.yaml', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => (p as string).includes('nexical.yaml'),
    );
    vi.mocked(
      fs.readFile as unknown as (p: string, e: string) => Promise<string>,
    ).mockResolvedValue('ai:\n  provider: vertex');
    vi.mocked(YAML.parse).mockReturnValue({ ai: { provider: 'vertex' } });

    await command.run({ promptName: 'test-prompt' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        aiConfig: { provider: 'vertex' },
      }),
    );
  });

  it('should handle missing AI config in nexical.yaml', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => (p as string).includes('nexical.yaml'),
    );
    vi.mocked(
      fs.readFile as unknown as (p: string, e: string) => Promise<string>,
    ).mockResolvedValue('name: my-project');
    vi.mocked(YAML.parse).mockReturnValue({ name: 'my-project' });

    await command.run({ promptName: 'test-prompt' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        aiConfig: {},
      }),
    );
  });

  it('should handle falsy YAML parse result', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => (p as string).includes('nexical.yaml'),
    );
    vi.mocked(
      fs.readFile as unknown as (p: string, e: string) => Promise<string>,
    ).mockResolvedValue('');
    vi.mocked(YAML.parse).mockReturnValue(null);

    await command.run({ promptName: 'test-prompt' });

    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        aiConfig: {},
      }),
    );
  });

  it('should handle nexical.yaml parse errors', async () => {
    vi.mocked<(p: string) => Promise<boolean>>(fs.pathExists).mockImplementation(
      async (p: string | Buffer | URL) => (p as string).includes('nexical.yaml'),
    );
    vi.mocked(
      fs.readFile as unknown as (p: string, e: string) => Promise<string>,
    ).mockResolvedValue('invalid: yaml: :');
    vi.mocked(YAML.parse).mockImplementation(() => {
      throw new Error('parse error');
    });

    await command.run({ promptName: 'test-prompt' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to parse nexical.yaml'),
    );
    expect(PromptRunner.run).toHaveBeenCalledWith(
      expect.objectContaining({
        aiConfig: {},
      }),
    );
  });

  it('should exit with error code if PromptRunner fails', async () => {
    vi.mocked(PromptRunner.run).mockResolvedValue(1);

    await expect(command.run({ promptName: 'test-prompt' })).rejects.toThrow('Process.exit(1)');
  });

  it('should set default root_path if not provided', async () => {
    await command.run({ promptName: 'test-prompt' });

    const call = vi.mocked(PromptRunner.run).mock.calls[0][0];
    expect(call?.args?.root_path).toBe(process.cwd() + '/');
  });

  it('should use provided root_path from args', async () => {
    await command.run({ promptName: 'test-prompt', args: ['--root_path', '/custom/path/'] });

    const call = vi.mocked(PromptRunner.run).mock.calls[0][0];
    expect(call?.args?.root_path).toBe('/custom/path/');
  });
});
