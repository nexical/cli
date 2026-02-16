import { type CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import { clone, getRemoteUrl, addSubmodule } from '../../utils/git.js';
import { resolveGitUrl } from '../../utils/url-resolver.js';
import YAML from 'yaml';

export default class ModuleAddCommand extends BaseCommand {
  static usage = 'module add <url>';
  static description = 'Add a module and its dependencies as git submodules.';
  static requiresProject = true;

  static args: CommandDefinition = {
    args: [{ name: 'url', required: true, description: 'Git repository URL or gh@org/repo' }],
  };

  private visited = new Set<string>();

  async run(options: { url: string }) {
    const projectRoot = this.projectRoot as string;
    const { url } = options;

    if (!url) {
      this.error('Please specify a repository URL.');
      return;
    }

    try {
      await this.installModule(url);

      this.info('Syncing workspace dependencies...');
      await runCommand('npm install', projectRoot);

      this.success('All modules installed successfully.');
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.error(`Failed to add module: ${e.message}`);
      } else {
        this.error(`Failed to add module: ${String(e)}`);
      }
    }
  }

  private async installModule(url: string) {
    const projectRoot = this.projectRoot as string;

    // Resolve URL using utility
    url = resolveGitUrl(url);

    const [repoUrl, subPath] = url.split('.git//');
    const cleanUrl = subPath ? repoUrl + '.git' : url;

    if (this.visited.has(cleanUrl)) {
      logger.debug(`Already visited ${cleanUrl}, skipping.`);
      return;
    }
    this.visited.add(cleanUrl);

    this.info(`Inspecting ${cleanUrl}...`);

    // Stage 1: Inspect (Temp Clone)
    const stagingDir = path.resolve(
      projectRoot!,
      '.nexical',
      'cache',
      `staging-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    );
    let moduleName = '';
    let moduleType: 'backend' | 'frontend' = 'backend'; // Default to backend if uncertain, but we should detect.
    let dependencies: string[] = [];

    try {
      await fs.ensureDir(stagingDir);

      // Shallow clone to inspect
      await clone(cleanUrl, stagingDir, { depth: 1 });

      // Search path handling
      const searchPath = subPath ? path.join(stagingDir, subPath) : stagingDir;

      // 1. Detect Module Name & Dependencies
      const moduleYamlPath = path.join(searchPath, 'module.yaml');
      const moduleYmlPath = path.join(searchPath, 'module.yml');
      const pkgJsonPath = path.join(searchPath, 'package.json');

      let configPath = '';
      if (await fs.pathExists(moduleYamlPath)) configPath = moduleYamlPath;
      else if (await fs.pathExists(moduleYmlPath)) configPath = moduleYmlPath;

      // Try to get name from module.yaml/yml
      if (configPath) {
        const configContent = await fs.readFile(configPath, 'utf8');
        const config = YAML.parse(configContent);
        if (config.name) moduleName = config.name;
        dependencies = config.dependencies || [];
      }

      // If no name yet, try package.json
      if (!moduleName && (await fs.pathExists(pkgJsonPath))) {
        try {
          const pkg = await fs.readJson(pkgJsonPath);
          if (pkg.name) {
            // Handle scoped packages @modules/name -> name
            moduleName = pkg.name.startsWith('@modules/') ? pkg.name.split('/')[1] : pkg.name;
          }
        } catch {
          /* ignore */
        }
      }

      // Fallback to git repo name if still no name
      if (!moduleName) {
        moduleName = path.basename(cleanUrl, '.git');
      }

      // 2. Detect Module Type
      // Frontend indicators: ui.yaml, or specifically typed in module.config.mjs (harder to parse statically), or package.json dependencies like 'react'/'astro' (maybe too broad).
      // Backend indicators: models.yaml, api.yaml, access.yaml.

      const hasUiYaml = await fs.pathExists(path.join(searchPath, 'ui.yaml'));
      const hasModelsYaml = await fs.pathExists(path.join(searchPath, 'models.yaml'));
      const hasApiYaml = await fs.pathExists(path.join(searchPath, 'api.yaml'));

      if (hasUiYaml) {
        moduleType = 'frontend';
      } else if (hasModelsYaml || hasApiYaml) {
        moduleType = 'backend';
      } else {
        // Fallback: Check checking package.json for "auth-astro" which is common in both, but maybe "react" or "vue" for frontend?
        // Let's assume Backend default if ambiguous for now, or check for specific folder structure?
        // Let's look for `src/components` vs `src/services`.
        if (await fs.pathExists(path.join(searchPath, 'src', 'components'))) {
          moduleType = 'frontend';
        } else {
          moduleType = 'backend';
        }
      }

      // Normalize dependencies
      if (dependencies && !Array.isArray(dependencies)) {
        dependencies = Object.keys(dependencies);
      }
    } finally {
      // Cleanup staging always
      await fs.remove(stagingDir);
    }

    // Stage 2: Conflict Detection & Path Resolution
    const modulesBaseDir =
      moduleType === 'frontend' ? 'apps/frontend/modules' : 'apps/backend/modules';
    const relativeTargetDir = path.join(modulesBaseDir, moduleName);
    const targetDir = path.join(projectRoot!, relativeTargetDir);

    if (await fs.pathExists(targetDir)) {
      // Check origin
      const existingRemote = await getRemoteUrl(targetDir);
      const normExisting = existingRemote.replace(/\.git$/, '');
      const normNew = cleanUrl.replace(/\.git$/, '');

      if (normExisting !== normNew && existingRemote !== '') {
        throw new Error(
          `Dependency Conflict! Module '${moduleName}' exists in ${moduleType} but remote '${existingRemote}' does not match '${cleanUrl}'.`,
        );
      }

      this.info(`Module ${moduleName} already installed in ${moduleType}.`);
    } else {
      // Stage 3: Submodule Add
      this.info(`Installing ${moduleName} (${moduleType}) to ${relativeTargetDir}...`);
      await fs.ensureDir(path.dirname(targetDir)); // Ensure apps/backend/modules exists
      await addSubmodule(cleanUrl, relativeTargetDir, projectRoot!);
    }

    // Update nexical.yaml
    await this.addToConfig(moduleName, moduleType);

    // Stage 4: Recurse
    if (dependencies.length > 0) {
      this.info(`Resolving ${dependencies.length} dependencies for ${moduleName}...`);
      for (const depUrl of dependencies) {
        await this.installModule(depUrl);
      }
    }
  }

  private async addToConfig(moduleName: string, type: 'backend' | 'frontend') {
    const projectRoot = this.projectRoot as string;
    const configPath = path.join(projectRoot, 'nexical.yaml');

    if (!(await fs.pathExists(configPath))) {
      logger.warn('nexical.yaml not found, skipping module list update.');
      return;
    }

    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = YAML.parse(content) || {};

      if (!config.modules) config.modules = {};

      // Migration: If modules is array, convert to object
      if (Array.isArray(config.modules)) {
        const oldModules = config.modules;
        config.modules = { backend: oldModules, frontend: [] }; // Assume old were backend? Or just move them to backend for safety.
      }

      if (!config.modules[type]) config.modules[type] = [];

      if (!config.modules[type].includes(moduleName)) {
        config.modules[type].push(moduleName);
        await fs.writeFile(configPath, YAML.stringify(config));
        logger.debug(`Added ${moduleName} to nexical.yaml modules.${type} list.`);
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
