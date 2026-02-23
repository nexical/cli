import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import PromptCommand from '../../../src/commands/prompt.js';
import { createTempDir, createMockRepo, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { CLI } from '@nexical/cli-core';
import { PromptRunner } from '@nexical/ai';

vi.mock('@nexical/ai', () => ({
  PromptRunner: {
    run: vi.fn().mockResolvedValue(0),
  },
}));

describe('Prompt Command Integration', () => {
  let projectDir: string;

  beforeEach(async () => {
    const temp = await createTempDir('prompt-integration-');
    projectDir = await createMockRepo(temp, {
      'package.json': '{"name": "prompt-project", "version": "1.0.0"}',
      'nexical.yaml': 'ai:\n  provider: vertex',
      'prompts/test-prompt.md': 'Testing {{ name }}',
    });
  });

  afterAll(async () => {
    await cleanupTestRoot();
  });

  it('should resolve project config and call PromptRunner', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);
      const cli = new CLI({ commandName: 'nexical' });
      const command = new PromptCommand(cli);

      // We need to set projectRoot manually because BaseCommand detection
      // might fail if not properly initialized in test env
      (command as unknown as { projectRoot: string }).projectRoot = projectDir;

      await command.run({ promptName: 'test-prompt' });

      expect(PromptRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          promptName: 'test-prompt',
          promptDirs: [path.join(projectDir, 'prompts')],
          aiConfig: { provider: 'vertex' },
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should resolve module context in integration', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);

      const moduleDir = path.join(projectDir, 'apps/frontend/modules/my-mod');
      await fs.ensureDir(moduleDir);

      const cli = new CLI({ commandName: 'nexical' });
      const command = new PromptCommand(cli);
      (command as unknown as { projectRoot: string }).projectRoot = projectDir;

      await command.run({ promptName: 'test-prompt', module: 'my-mod' });

      expect(PromptRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            module_name: 'my-mod',
            module_type: 'frontend',
            module_root: moduleDir,
          }),
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('should include generator agents prompts if they exist in integration', async () => {
    const originalCwd = process.cwd();
    try {
      process.chdir(projectDir);

      const generatorPromptsDir = path.join(projectDir, 'packages/generator/prompts/agents');
      await fs.ensureDir(generatorPromptsDir);

      const cli = new CLI({ commandName: 'nexical' });
      const command = new PromptCommand(cli);
      (command as unknown as { projectRoot: string }).projectRoot = projectDir;

      await command.run({ promptName: 'test-prompt' });

      expect(PromptRunner.run).toHaveBeenCalledWith(
        expect.objectContaining({
          promptDirs: expect.arrayContaining([
            path.join(projectDir, 'prompts'),
            generatorPromptsDir,
          ]),
        }),
      );
    } finally {
      process.chdir(originalCwd);
    }
  });
});
