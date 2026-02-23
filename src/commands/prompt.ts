import { type CommandDefinition, BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import minimist from 'minimist';
import YAML from 'yaml';
import { PromptRunner } from '@nexical/ai';

export default class PromptCommand extends BaseCommand {
  static usage = 'prompt <prompt-name> [args...]';
  static description = 'Run an AI prompt using templates from the prompts directory.';
  static requiresProject = true;

  static args: CommandDefinition = {
    args: [
      {
        name: 'promptName',
        required: true,
        description: 'The name of the markdown file in the prompts directory.',
      },
      {
        name: 'args...',
        required: false,
        description: 'Additional arguments for the template and command',
      },
    ],
    options: [
      {
        name: '--module, -m <module>',
        description:
          'Target a specific module (searches apps/frontend/modules and apps/backend/modules)',
      },
      { name: '--interactive, -i', description: 'Run in interactive chat mode' },
      {
        name: '--models <models>',
        description: 'Comma-separated list of models to try',
        default: 'gemini-3-flash-preview,gemini-3-pro-preview',
      },
    ],
  };

  async run(options: {
    promptName: string;
    args?: string[];
    module?: string;
    m?: string;
    interactive?: boolean;
    i?: boolean;
    models?: string;
  }) {
    const projectRoot = this.projectRoot as string;
    const promptName = options.promptName;

    // Parse additional template flags
    const argv = minimist(options.args || []);
    const isInteractive = !!(options.interactive || options.i || argv.interactive || argv.i);
    const moduleName = options.module || options.m || argv.module || argv.m;
    const modelsArg =
      options.models || argv.models || 'gemini-3-flash-preview,gemini-3-pro-preview';
    const models = modelsArg
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    const PROMPTS_DIRS = [path.join(projectRoot, 'prompts')];
    const generatorAgentsPrompts = path.join(projectRoot, 'packages/generator/prompts/agents');

    if (await fs.pathExists(generatorAgentsPrompts)) {
      PROMPTS_DIRS.push(generatorAgentsPrompts);
    }

    // Module Resolution Logic
    const contextVars = { ...argv };
    if (moduleName) {
      const frontendPath = path.join(projectRoot, 'apps/frontend/modules', moduleName);
      const backendPath = path.join(projectRoot, 'apps/backend/modules', moduleName);

      let moduleRoot: string | undefined;
      let moduleType: 'frontend' | 'backend' | undefined;

      if (await fs.pathExists(frontendPath)) {
        moduleRoot = frontendPath;
        moduleType = 'frontend';
      } else if (await fs.pathExists(backendPath)) {
        moduleRoot = backendPath;
        moduleType = 'backend';
      }

      if (!moduleRoot) {
        this.error(
          `Module '${moduleName}' not found in apps/frontend/modules or apps/backend/modules.`,
        );
        return;
      }

      logger.debug(`[Context] Targeting ${moduleType} module: ${moduleName}`);
      contextVars.module_root = moduleRoot;
      contextVars.module_name = moduleName;
      contextVars.module_type = moduleType;
      contextVars.root_path = moduleRoot + '/';
    } else {
      if (!contextVars.root_path) {
        contextVars.root_path = process.cwd() + '/';
      }
    }

    // Extract AI configuration from nexical.yaml
    const configPath = path.join(projectRoot, 'nexical.yaml');
    let aiConfig: Record<string, unknown> = {};
    if (await fs.pathExists(configPath)) {
      try {
        const content = await fs.readFile(configPath, 'utf8');
        const config = YAML.parse(content) || {};
        aiConfig = (config.ai as Record<string, unknown>) || {};
      } catch {
        logger.warn('Failed to parse nexical.yaml AI config, using defaults.');
      }
    }

    const finalCode = await PromptRunner.run({
      promptName,
      promptDirs: PROMPTS_DIRS,
      args: contextVars,
      aiConfig,
      models,
      interactive: isInteractive as boolean,
    });

    if (finalCode !== 0) {
      process.exit(finalCode);
    }
  }
}
