import { type CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';

export default class ModuleUpdateCommand extends BaseCommand {
  static usage = 'module update [name]';
  static description = 'Update a specific module or all modules.';
  static requiresProject = true;

  static args: CommandDefinition = {
    args: [{ name: 'name', required: false, description: 'Name of the module to update' }],
  };

  async run(options: { name?: string }) {
    const projectRoot = this.projectRoot as string;
    const { name } = options;

    this.info(name ? `Updating module ${name}...` : 'Updating all modules...');
    logger.debug('Update context:', { name, projectRoot: projectRoot });

    try {
      if (name) {
        const relativePath = `modules/${name}`;
        const fullPath = path.resolve(projectRoot, relativePath);

        if (!(await fs.pathExists(fullPath))) {
          this.error(`Module ${name} not found.`);
          return;
        }

        // Update specific module
        // We enter the directory and pull? Or generic submodule update?
        // Generic submodule update --remote src/modules/name
        await runCommand(`git submodule update --remote --merge ${relativePath}`, projectRoot);
      } else {
        // Update all
        await runCommand('git submodule update --remote --merge', projectRoot);
      }

      this.info('Syncing workspace dependencies...');
      await runCommand('npm install', projectRoot);

      this.success('Modules updated successfully.');
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.error(`Failed to update modules: ${e.message}`);
      } else {
        this.error(`Failed to update modules: ${String(e)}`);
      }
    }
  }
}
