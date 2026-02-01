import { CommandDefinition, BaseCommand, logger, runCommand } from '@nexical/cli-core';
import * as git from '../utils/git.js';
import { resolveGitUrl } from '../utils/url-resolver.js';
import fs from 'fs-extra';
import path from 'path';

export default class InitCommand extends BaseCommand {
    static usage = 'init';
    static description = 'Initialize a new Nexical project.';
    static requiresProject = false;

    static args: CommandDefinition = {
        args: [
            { name: 'directory', required: true, description: 'Directory to initialize the project in' }
        ],
        options: [
            {
                name: '--repo <url>',
                description: 'Starter repository URL (supports gh@owner/repo syntax)',
                default: 'gh@nexical/app-core'
            }
        ]
    };

    async run(options: any) {
        const directory = options.directory;
        const targetPath = path.resolve(process.cwd(), directory);
        let repoUrl = resolveGitUrl(options.repo);

        logger.debug('Init options:', { directory, targetPath, repoUrl });

        this.info(`Initializing project in: ${targetPath}`);
        this.info(`Using starter repository: ${repoUrl}`);

        if (await fs.pathExists(targetPath)) {
            if ((await fs.readdir(targetPath)).length > 0) {
                this.error(`Directory ${directory} is not empty.`);
                process.exit(1);
            }
        } else {
            await fs.mkdir(targetPath, { recursive: true });
        }

        try {
            this.info('Cloning core repository...');
            await git.clone(repoUrl, targetPath, { recursive: true });

            this.info('Updating submodules...');
            await git.updateSubmodules(targetPath);

            this.info('Installing dependencies...');
            await runCommand('npm install', targetPath);

            this.info('Setting up upstream remote...');
            await git.renameRemote('origin', 'upstream', targetPath);

            // Ensure module directory
            await fs.ensureDir(path.join(targetPath, 'modules'));

            // Check for nexical.yaml, if not present create a default one
            const configPath = path.join(targetPath, 'nexical.yaml');
            if (!await fs.pathExists(configPath)) {
                this.info('Creating default nexical.yaml...');
                await fs.writeFile(configPath, 'name: ' + path.basename(targetPath) + '\nmodules: []\n');
            }

            // Create VERSION file
            const versionPath = path.join(targetPath, 'VERSION');
            // Check if version file exists, if not create it
            if (!await fs.pathExists(versionPath)) {
                this.info('Creating VERSION file with 0.1.0...');
                await fs.writeFile(versionPath, '0.1.0');
            }

            await git.addAll(targetPath);
            await git.commit('Initial site commit', targetPath);

            this.success(`Project initialized successfully in ${directory}!`);

        } catch (error: any) {
            this.error(`Failed to initialize project: ${error.message}`);
            process.exit(1);
        }
    }
}
