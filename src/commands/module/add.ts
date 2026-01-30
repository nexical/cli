import { CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import { clone, getRemoteUrl } from '../../utils/git.js';
import { resolveGitUrl } from '../../utils/url-resolver.js';
import YAML from 'yaml';

export default class ModuleAddCommand extends BaseCommand {
    static usage = 'module add <url>';
    static description = 'Add a module and its dependencies as git submodules.';
    static requiresProject = true;

    static args: CommandDefinition = {
        args: [
            { name: 'url', required: true, description: 'Git repository URL or gh@org/repo' }
        ]
    };

    private visited = new Set<string>();

    async run(options: any) {
        const projectRoot = this.projectRoot as string;
        let { url } = options;

        if (!url) {
            this.error('Please specify a repository URL.');
            return;
        }

        try {
            await this.installModule(url);

            this.info('Syncing workspace dependencies...');
            await runCommand('npm install', projectRoot);

            this.success('All modules installed successfully.');
        } catch (e: any) {
            this.error(`Failed to add module: ${e.message}`);
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
        const stagingDir = path.resolve(projectRoot!, '.nexical', 'cache', `staging-${Date.now()}-${Math.random().toString(36).substring(7)}`);
        let moduleName = '';
        let dependencies: string[] = [];

        try {
            await fs.ensureDir(stagingDir);

            // Shallow clone to inspect
            await clone(cleanUrl, stagingDir, { depth: 1 });

            // Read module.yaml
            const searchPath = subPath ? path.join(stagingDir, subPath) : stagingDir;
            const moduleYamlPath = path.join(searchPath, 'module.yaml');
            const moduleYmlPath = path.join(searchPath, 'module.yml');

            let configPath = '';
            if (await fs.pathExists(moduleYamlPath)) configPath = moduleYamlPath;
            else if (await fs.pathExists(moduleYmlPath)) configPath = moduleYmlPath;
            else {
                throw new Error(`No module.yaml found in ${cleanUrl}${subPath ? '//' + subPath : ''}`);
            }

            const configContent = await fs.readFile(configPath, 'utf8');
            const config = YAML.parse(configContent);

            if (!config.name) {
                throw new Error(`Module at ${url} is missing 'name' in module.yaml`);
            }
            moduleName = config.name;
            dependencies = config.dependencies || [];

            // Normalize dependencies to array if object (though spec says list of strings, defensiveness is good)
            if (dependencies && !Array.isArray(dependencies)) {
                dependencies = Object.keys(dependencies);
            }

        } catch (e: any) { // Catching as 'any' for error message access
            throw e;
        } finally {
            // Cleanup staging always
            await fs.remove(stagingDir);
        }

        // Stage 2: Conflict Detection
        const targetDir = path.join(projectRoot!, 'modules', moduleName);
        const relativeTargetDir = path.relative(projectRoot!, targetDir);

        if (await fs.pathExists(targetDir)) {
            // Check origin
            const existingRemote = await getRemoteUrl(targetDir);
            // We compare cleanUrl (the repo root).
            // normalize both
            const normExisting = existingRemote.replace(/\.git$/, '');
            const normNew = cleanUrl.replace(/\.git$/, '');

            if (normExisting !== normNew && existingRemote !== '') {
                throw new Error(`Dependency Conflict! Module '${moduleName}' exists but remote '${existingRemote}' does not match '${cleanUrl}'.`);
            }

            this.info(`Module ${moduleName} already installed.`);
            // Proceed to recurse, but skip add
        } else {
            // Stage 3: Submodule Add
            this.info(`Installing ${moduleName} to ${relativeTargetDir}...`);
            // We install the ROOT repo.
            // IMPORTANT: If subPath exists, "Identity is Internal" means we name the folder `moduleName`.
            // But the CONTENT will be the whole repo.
            // If the user meant to only have the subdir, we can't do that with submodule add easily without manual git plumbing.
            // Given instructions, I will proceed with submodule add of root repo to target dir.
            await runCommand(`git submodule add ${cleanUrl} ${relativeTargetDir}`, projectRoot!);
        }

        // Stage 4: Recurse
        if (dependencies.length > 0) {
            this.info(`Resolving ${dependencies.length} dependencies for ${moduleName}...`);
            for (const depUrl of dependencies) {
                await this.installModule(depUrl);
            }
        }
    }
}
