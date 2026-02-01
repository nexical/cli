import { type CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';

export default class ModuleRemoveCommand extends BaseCommand {
    static usage = 'module remove <name>';
    static description = 'Remove an installed module.';
    static requiresProject = true;

    static args: CommandDefinition = {
        args: [
            { name: 'name', required: true, description: 'Name of the module to remove' }
        ]
    };

    async run(options: any) {
        const projectRoot = this.projectRoot as string;
        let { name } = options;

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

            this.success(`Module ${name} removed successfully.`);
        } catch (e: any) {
            this.error(`Failed to remove module: ${e.message}`);
        }
    }
}
