import { BaseCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import YAML from 'yaml';

interface ModuleInfo {
  name: string;
  version: string;
  description: string;
  type: 'backend' | 'frontend' | 'legacy';
}

export default class ModuleListCommand extends BaseCommand {
  static usage = 'module list';
  static description = 'List installed modules.';
  static requiresProject = true;

  async run() {
    const projectRoot = this.projectRoot as string;

    // Define locations to scan
    const builtInLocations = [
      { type: 'backend', path: path.join(projectRoot, 'apps/backend/modules') },
      { type: 'frontend', path: path.join(projectRoot, 'apps/frontend/modules') },
      // Check legacy `modules` folder just in case?
      { type: 'legacy', path: path.join(projectRoot, 'modules') },
    ];

    const allModules: ModuleInfo[] = [];

    for (const loc of builtInLocations) {
      if (await fs.pathExists(loc.path)) {
        const modules = await fs.readdir(loc.path);

        for (const moduleName of modules) {
          const modulePath = path.join(loc.path, moduleName);
          if ((await fs.stat(modulePath)).isDirectory()) {
            const info = await this.getModuleInfo(
              modulePath,
              moduleName,
              loc.type as 'backend' | 'frontend' | 'legacy',
            );
            allModules.push(info);
          }
        }
      }
    }

    if (allModules.length === 0) {
      this.info('No modules installed.');
    } else {
      // Sort by type then name
      allModules.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
      });
      // eslint-disable-next-line no-console
      console.table(allModules);
    }
  }

  private async getModuleInfo(
    modulePath: string,
    dirName: string,
    type: 'backend' | 'frontend' | 'legacy',
  ): Promise<ModuleInfo> {
    let version = 'unknown';
    let description = '';

    const pkgJsonPath = path.join(modulePath, 'package.json');
    const moduleYamlPath = path.join(modulePath, 'module.yaml');
    const moduleYmlPath = path.join(modulePath, 'module.yml');

    let pkg: Record<string, unknown> = {};
    let modConfig: Record<string, unknown> = {};

    if (await fs.pathExists(pkgJsonPath)) {
      try {
        pkg = (await fs.readJson(pkgJsonPath)) || {};
      } catch {
        /* ignore */
      }
    }

    if ((await fs.pathExists(moduleYamlPath)) || (await fs.pathExists(moduleYmlPath))) {
      try {
        const configPath = (await fs.pathExists(moduleYamlPath)) ? moduleYamlPath : moduleYmlPath;
        const content = await fs.readFile(configPath, 'utf8');
        modConfig = YAML.parse(content) || {};
      } catch {
        /* ignore */
      }
    }

    version = (pkg.version as string) || (modConfig.version as string) || 'unknown';
    description = (pkg.description as string) || (modConfig.description as string) || '';

    // Use config name if available, else dirName
    const name = (modConfig.name as string) || dirName;

    return { name, version, description, type };
  }
}
