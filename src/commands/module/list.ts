import { BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';

export default class ModuleListCommand extends BaseCommand {
    static usage = 'module list';
    static description = 'List installed modules.';
    static requiresProject = true;

    async run() {
        const projectRoot = this.projectRoot as string;
        const modulesDir = path.resolve(projectRoot, 'modules');
        logger.debug(`Scanning for modules in: ${modulesDir}`);

        if (!(await fs.pathExists(modulesDir))) {
            this.info('No modules installed (modules directory missing).');
            return;
        }

        try {
            const modules = await fs.readdir(modulesDir);
            const validModules: { name: string; version: string; description: string }[] = [];

            for (const moduleName of modules) {
                const modulePath = path.join(modulesDir, moduleName);
                if ((await fs.stat(modulePath)).isDirectory()) {
                    let version = 'unknown';
                    let description = '';

                    const pkgJsonPath = path.join(modulePath, 'package.json');
                    if (await fs.pathExists(pkgJsonPath)) {
                        try {
                            const pkg = await fs.readJson(pkgJsonPath);
                            version = pkg.version || 'unknown';
                            description = pkg.description || '';
                        } catch (e) {
                            // ignore
                        }
                    }
                    validModules.push({ name: moduleName, version, description });
                }
            }

            if (validModules.length === 0) {
                this.info('No modules installed.');
            } else {
                console.table(validModules);
            }
        } catch (error: any) {
            this.error(`Failed to list modules: ${error.message}`);
        }
    }
}
