import { BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';

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
          const moduleYamlPath = path.join(modulePath, 'module.yaml');
          const moduleYmlPath = path.join(modulePath, 'module.yml');

          let pkg: Record<string, unknown> = {};
          let modConfig: Record<string, unknown> = {};

          if (await fs.pathExists(pkgJsonPath)) {
            try {
              pkg = await fs.readJson(pkgJsonPath);
            } catch {
              /* ignore */
            }
          }

          if ((await fs.pathExists(moduleYamlPath)) || (await fs.pathExists(moduleYmlPath))) {
            try {
              const configPath = (await fs.pathExists(moduleYamlPath))
                ? moduleYamlPath
                : moduleYmlPath;
              const content = await fs.readFile(configPath, 'utf8');
              modConfig = YAML.parse(content) || {};
            } catch {
              /* ignore */
            }
          }

          version = (pkg.version as string) || (modConfig.version as string) || 'unknown';
          description = (pkg.description as string) || (modConfig.description as string) || '';
          // Optionally use display name from module.yaml if present, but strictly list is usually dir name.
          // Let's stick to dir name for "name" column, but description from module.yaml is good.
          validModules.push({ name: moduleName, version, description });
        }
      }

      if (validModules.length === 0) {
        this.info('No modules installed.');
      } else {
        // eslint-disable-next-line no-console
        console.table(validModules);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(`Failed to list modules: ${error.message}`);
      } else {
        this.error(`Failed to list modules: ${String(error)}`);
      }
    }
  }
}
