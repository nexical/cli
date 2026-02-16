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
        // Check locations
        const locations = [
          { type: 'backend', path: `apps/backend/modules/${name}` },
          { type: 'frontend', path: `apps/frontend/modules/${name}` },
          { type: 'legacy', path: `modules/${name}` },
        ];

        let targetLoc: { type: string; path: string } | null = null;

        for (const loc of locations) {
          const absPath = path.resolve(projectRoot, loc.path);
          if (await fs.pathExists(absPath)) {
            targetLoc = loc;
            break;
          }
        }

        if (!targetLoc) {
          this.error(`Module ${name} not found.`);
          return;
        }

        const relativePath = targetLoc.path;

        // Update specific module
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
