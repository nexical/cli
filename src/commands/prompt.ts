import { type CommandDefinition, BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import os from 'node:os';
import nunjucks from 'nunjucks';
import minimist from 'minimist';
import readline from 'node:readline';
import YAML from 'yaml';
import { pack } from 'repomix';
import { existsSync, statSync } from 'node:fs';
import { AiClientFactory } from '@nexical/ai';

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
    const isInteractive = options.interactive || options.i || argv.interactive || argv.i;
    const moduleName = options.module || options.m || argv.module || argv.m;
    const modelsArg =
      options.models || argv.models || 'gemini-3-flash-preview,gemini-3-pro-preview';
    const models = modelsArg
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean);

    // Resolve prompt file from multiple directories
    const promptFileName = promptName.endsWith('.md') ? promptName : `${promptName}.md`;
    const PROMPTS_DIRS = [path.join(projectRoot, 'prompts')];
    const generatorAgentsPrompts = path.join(projectRoot, 'packages/generator/prompts/agents');

    if (await fs.pathExists(generatorAgentsPrompts)) {
      PROMPTS_DIRS.push(generatorAgentsPrompts);
    }

    let promptFile: string | undefined;
    for (const dir of PROMPTS_DIRS) {
      const candidate = path.join(dir, promptFileName);
      if (await fs.pathExists(candidate)) {
        promptFile = candidate;
        break;
      }
    }

    if (!promptFile) {
      this.error(
        `Prompt file '${promptFileName}' not found in any of the search directories:\n` +
          PROMPTS_DIRS.map((d) => `  - ${d}`).join('\n'),
      );
      return;
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

    // Configure Nunjucks
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(PROMPTS_DIRS), {
      autoescape: false,
      trimBlocks: true,
      lstripBlocks: true,
    });

    const asyncResolvers = new Map<string, Promise<string>>();
    let resolverId = 0;

    // Helper: context(path) -> runs repomix
    env.addGlobal('context', (targetPath: string) => {
      const id = `__NEXICAL_ASYNC_CONTEXT_${resolverId++}__`;
      const promise = (async () => {
        try {
          if (!existsSync(targetPath)) {
            logger.debug(`[Context] Path not found: ${targetPath}`);
            return `[Path not found: ${targetPath}]`;
          }

          const stats = statSync(targetPath);
          if (stats.isFile()) {
            logger.debug(`[Context] Reading file directly at: ${targetPath}`);
            const content = await fs.readFile(targetPath, 'utf-8');
            return `<CODEBASE_CONTEXT path="${targetPath}">\n${content}\n</CODEBASE_CONTEXT>`;
          }

          logger.debug(`[Context] Analyzing codebase at: ${targetPath}`);
          const tempOutputFile = path.join(
            os.tmpdir(),
            `repomix-output-${Date.now()}-${Math.random().toString(36).substring(7)}.xml`,
          );

          await pack([targetPath], {
            input: { maxFileSize: 1024 * 1024 * 10 },
            output: {
              filePath: tempOutputFile,
              style: 'xml',
              showLineNumbers: false,
              fileSummary: false,
              directoryStructure: false,
              removeComments: false,
              removeEmptyLines: false,
              includeEmptyDirectories: false,
              topFilesLength: 5,
              parsableStyle: false,
              files: true,
              compress: false,
              truncateBase64: true,
              copyToClipboard: false,
              includeDiffs: false,
              includeLogs: false,
              includeLogsCount: 0,
              gitSortByChanges: false,
              includeFullDirectoryStructure: false,
            },
            ignore: {
              useGitignore: true,
              useDotIgnore: true,
              useDefaultPatterns: true,
              customPatterns: ['**/node_modules', '**/dist'],
            },
            include: [],
            security: { enableSecurityCheck: false },
            tokenCount: { encoding: 'o200k_base' },
            cwd: targetPath,
          } as unknown as Parameters<typeof pack>[1]);

          const output = await fs.readFile(tempOutputFile, 'utf-8');
          try {
            await fs.unlink(tempOutputFile);
          } catch {
            /* ignore */
          }
          return `<CODEBASE_CONTEXT path="${targetPath}">\n${output}\n</CODEBASE_CONTEXT>`;
        } catch (error) {
          logger.error(`[Context] Error generating context for ${targetPath}: ${error}`);
          return `[Error generating context for ${targetPath}]`;
        }
      })();
      asyncResolvers.set(id, promise);
      return id;
    });

    // Helper: read(path) -> reads local file
    env.addGlobal('read', (relativePath: string | string[]) => {
      const id = `__NEXICAL_ASYNC_READ_${resolverId++}__`;
      const promise = (async () => {
        try {
          const cwdStr = process.cwd();
          if (Array.isArray(relativePath)) {
            const contents = await Promise.all(
              relativePath.map(async (p) => {
                const resolvedPath = path.resolve(cwdStr, p);
                if (!existsSync(resolvedPath)) {
                  logger.debug(`[Read] File not found: ${resolvedPath}`);
                  return `[File not found: ${resolvedPath}]`;
                }
                return await fs.readFile(resolvedPath, 'utf-8');
              }),
            );
            return contents.join('\n\n');
          } else if (typeof relativePath === 'string' && relativePath.includes(',')) {
            const contents = await Promise.all(
              relativePath.split(',').map(async (p) => {
                const resolvedPath = path.resolve(cwdStr, p.trim());
                if (!existsSync(resolvedPath)) {
                  logger.debug(`[Read] File not found: ${resolvedPath}`);
                  return `[File not found: ${resolvedPath}]`;
                }
                return await fs.readFile(resolvedPath, 'utf-8');
              }),
            );
            return contents.join('\n\n');
          }

          const resolvedPath = path.resolve(cwdStr, relativePath as string);
          if (!existsSync(resolvedPath)) {
            logger.debug(`[Read] File not found: ${resolvedPath}`);
            return `[File not found: ${resolvedPath}]`;
          }
          return await fs.readFile(resolvedPath, 'utf-8');
        } catch {
          logger.warn(`[Read] Warning: Could not read file: ${relativePath}`);
          return `[Error reading file ${relativePath}]`;
        }
      })();
      asyncResolvers.set(id, promise);
      return id;
    });

    // Read template content
    let templateContent: string;
    try {
      templateContent = await fs.readFile(promptFile, 'utf-8');
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Error reading prompt file: ${error.message}`);
      } else {
        this.error(`Error reading prompt file: ${String(error)}`);
      }
      return;
    }

    // Render template
    logger.debug(
      `[Render] Rendering template with variables:`,
      JSON.stringify(contextVars, null, 2),
    );
    let renderedPrompt: string;
    try {
      renderedPrompt = env.renderString(templateContent, {
        ...contextVars,
      });
    } catch (e) {
      this.error(`Template render error: ${e}`);
      return;
    }

    // Resolve placeholders
    for (const [id, promise] of asyncResolvers.entries()) {
      try {
        const resolvedValue = await promise;
        renderedPrompt = renderedPrompt.replace(id, resolvedValue);
      } catch (e) {
        logger.error(`[Render] Failed to resolve async variable ${id}: ${e}`);
        renderedPrompt = renderedPrompt.replace(id, `[Error resolving id]`);
      }
    }

    // Buffer to file
    const tempFile = path.join(os.tmpdir(), '.temp_prompt_active.md');
    await fs.writeFile(tempFile, renderedPrompt, 'utf-8');
    logger.debug(`[Buffer] Wrote active prompt to ${tempFile}`);

    logger.info(`[Agent] Model rotation strategy: [${models.join(', ')}]`);

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

    // Create AI client
    const aiClient = AiClientFactory.create(aiConfig);

    let currentPrompt = renderedPrompt;
    let finalCode = 0;

    while (true) {
      let success = false;
      let lastOutput = '';

      for (const model of models) {
        logger.info(`[Agent] Attempting with model: \x1b[36m${model}\x1b[0m...`);
        const result = await aiClient.run(model, currentPrompt);

        if (result.code === 0) {
          success = true;
          lastOutput = result.output;
          break;
        }

        if (result.shouldRetry) {
          logger.info(`[Agent] Switching to next model...`);
          continue;
        } else {
          finalCode = result.code;
          break;
        }
      }

      if (!success) {
        if (finalCode === 0) finalCode = 1;
        this.error(`[Agent] \u274C All attempts failed.`);
        break;
      }

      if (!isInteractive) {
        break;
      }

      currentPrompt += `\n${lastOutput}`;

      const askLink = () => {
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        return new Promise<string>((resolve) => {
          this.info('\n(Type "exit" or "quit" to end the session)');
          rl.question('> ', (ans) => {
            rl.close();
            resolve(ans);
          });
        });
      };

      const answer = await askLink();

      if (['exit', 'quit'].includes(answer.trim().toLowerCase())) {
        break;
      }

      currentPrompt += `\nUser: ${answer}\n`;
    }

    try {
      await fs.unlink(tempFile);
      logger.debug(`[Cleanup] Removed active prompt file`);
    } catch {
      // ignore cleanup errors
    }

    if (finalCode !== 0) {
      process.exit(finalCode);
    }
  }
}
