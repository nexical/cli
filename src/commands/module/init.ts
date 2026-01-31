import { CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import * as git from '../../utils/git.js';
import { resolveGitUrl } from '../../utils/url-resolver.js';
import glob from 'fast-glob';

export default class ModuleInitCommand extends BaseCommand {
    static usage = 'module init <module_name>';
    static description = 'Initialize a new module from a starter repository.';
    static requiresProject = true;

    static args: CommandDefinition = {
        args: [
            { name: 'module_name', required: true, description: 'Name of the new module' }
        ],
        options: [
            {
                name: '--repo <url>',
                description: 'Starter repository URL',
                default: 'gh@nexical-modules/starter'
            }
        ]
    };

    async run(options: any) {
        const projectRoot = this.projectRoot as string;
        const { module_name, repo } = options;

        const modulesDir = path.join(projectRoot, 'modules');
        const targetDir = path.join(modulesDir, module_name);

        if (await fs.pathExists(targetDir)) {
            if ((await fs.readdir(targetDir)).length > 0) {
                this.error(`Directory ${targetDir} is not empty.`);
            }
        }

        const repoUrl = resolveGitUrl(repo);
        this.info(`Initializing module '${module_name}' in ${targetDir}`);
        this.info(`Using starter: ${repoUrl}`);

        try {
            await fs.ensureDir(modulesDir);
            await fs.ensureDir(targetDir);

            // 1. Clone starter
            this.info('Cloning starter repository...');
            await git.clone(repoUrl, targetDir, { recursive: true });

            // 2. Remove old .git
            this.info('Removing git history...');
            await fs.remove(path.join(targetDir, '.git'));

            // 3. Token replacement
            this.info('Configuring module...');
            await this.replaceTokens(targetDir, module_name);

            // 4. Initialize new git repo
            this.info('Initializing new module repository...');
            await runCommand('git init', targetDir);
            await git.addAll(targetDir);
            await git.commit('Initial commit', targetDir);

            this.success(`Module '${module_name}' initialized successfully!`);
            this.info(`Location: ${targetDir}`);

        } catch (error: any) {
            this.error(`Failed to initialize module: ${error.message}`);
            // Cleanup on failure if we created the directory
            if (await fs.pathExists(targetDir)) {
                // Cleanup partial directory
                await fs.remove(targetDir);
            }
        }
    }

    private async replaceTokens(directory: string, moduleName: string) {
        // Find text files to replace token in. 
        // We focus on package.json, module.yaml, and potentially others.
        // We'll use fast-glob to find relevant files, ignoring node_modules just in case.
        const filePaths = await glob(['**/*'], {
            cwd: directory,
            ignore: ['node_modules/**', '.git/**'],
            onlyFiles: true,
            absolute: true
        });

        for (const filePath of filePaths) {
            try {
                // Determine if binary? For now, we just try/catch read utf8
                // or we can filter by extension. 
                // Let's rely on reading.
                const content = await fs.readFile(filePath, 'utf8');

                if (content.includes('{module_name}')) {
                    const newContent = content.replace(/{module_name}/g, moduleName);
                    await fs.writeFile(filePath, newContent, 'utf8');
                    logger.debug(`Updated ${path.relative(directory, filePath)}`);
                }
            } catch (e) {
                // Likely a binary file or unreadable, skip
                logger.debug(`Skipping file replacement for ${path.relative(directory, filePath)}`);
            }
        }
    }
}
