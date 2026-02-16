import { type CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';

export default class ModuleRemoveCommand extends BaseCommand {
  static usage = 'module remove <name>';
  static description = 'Remove an installed module.';
  static requiresProject = true;

  static args: CommandDefinition = {
    args: [{ name: 'name', required: true, description: 'Name of the module to remove' }],
  };

  async run(options: { name: string }) {
    const projectRoot = this.projectRoot as string;
    const { name } = options;

    // Check locations
    const locations = [
      { type: 'backend', path: `apps/backend/modules/${name}` },
      { type: 'frontend', path: `apps/frontend/modules/${name}` },
      { type: 'legacy', path: `modules/${name}` },
    ];

    let targetLoc: { type: string; path: string } | null = null;
    let fullPath = '';

    for (const loc of locations) {
      const absPath = path.resolve(projectRoot, loc.path);
      if (await fs.pathExists(absPath)) {
        targetLoc = loc;
        fullPath = absPath;
        break;
      }
    }

    if (!targetLoc) {
      this.error(`Module ${name} not found in any standard location.`);
      return;
    }

    const relativePath = targetLoc.path;

    logger.debug('Removing module at:', fullPath);
    this.info(`Removing module ${name} (${targetLoc.type})...`);

    try {
      await runCommand(`git submodule deinit -f ${relativePath}`, projectRoot);
      await runCommand(`git rm -f ${relativePath}`, projectRoot);

      // Clean up .git/modules if needed (git rm often handles this but sometimes leaves stale dirs in .git/modules)
      // The path in .git/modules depends on how it was added.
      // Usually .git/modules/apps/backend/modules/name
      // We'll leave strict git cleanup to git, manually removing can be risky if path structure varies.
      // But we can check for the directory itself just in case.

      this.info('Syncing workspace dependencies...');
      await runCommand('npm install', projectRoot);

      await this.removeFromConfig(name);

      this.success(`Module ${name} removed successfully.`);
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.error(`Failed to remove module: ${e.message}`);
      } else {
        this.error(`Failed to remove module: ${String(e)}`);
      }
    }
  }

  private async removeFromConfig(moduleName: string) {
    const projectRoot = this.projectRoot as string;
    const configPath = path.join(projectRoot, 'nexical.yaml');

    if (!(await fs.pathExists(configPath))) return;

    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = YAML.parse(content) || {};

      let changed = false;

      if (config.modules) {
        // Check if object
        if (!Array.isArray(config.modules)) {
          for (const key of Object.keys(config.modules)) {
            if (Array.isArray(config.modules[key]) && config.modules[key].includes(moduleName)) {
              config.modules[key] = config.modules[key].filter((m: string) => m !== moduleName);
              changed = true;
            }
          }
        } else {
          // Legacy array
          if (config.modules.includes(moduleName)) {
            config.modules = config.modules.filter((m: string) => m !== moduleName);
            changed = true;
          }
        }
      }

      if (changed) {
        await fs.writeFile(configPath, YAML.stringify(config));
        logger.debug(`Removed ${moduleName} from nexical.yaml modules list.`);
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.warn(`Failed to update nexical.yaml: ${e.message}`);
      } else {
        logger.warn(`Failed to update nexical.yaml: ${String(e)}`);
      }
    }
  }
}
