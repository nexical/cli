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

    const relativePath = `modules/${name}`;
    const fullPath = path.resolve(projectRoot, relativePath);

    logger.debug('Removing module at:', fullPath);

    if (!(await fs.pathExists(fullPath))) {
      this.error(`Module ${name} not found at ${relativePath}.`);
      return;
    }

    this.info(`Removing module ${name}...`);

    try {
      await runCommand(`git submodule deinit -f ${relativePath}`, projectRoot);
      await runCommand(`git rm -f ${relativePath}`, projectRoot);

      // Clean up .git/modules
      const gitModulesDir = path.resolve(projectRoot, '.git', 'modules', 'modules', name);
      if (await fs.pathExists(gitModulesDir)) {
        await fs.remove(gitModulesDir);
      }

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

      if (config.modules && config.modules.includes(moduleName)) {
        config.modules = config.modules.filter((m: string) => m !== moduleName);
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
