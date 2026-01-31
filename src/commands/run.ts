import { CommandDefinition, BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import process from 'node:process';
import { linkEnvironment } from '../utils/environment.js';

export default class RunCommand extends BaseCommand {
    static usage = 'run <script> [args...]';
    static description = 'Run a script inside the Nexical environment.';
    static requiresProject = true;

    static args: CommandDefinition = {
        args: [
            { name: 'script', required: true, description: 'The script to run (script-name OR module:script-name)' },
            { name: 'args...', required: false, description: 'Arguments for the script' }
        ]
    };

    async run(options: any) {
        const projectRoot = this.projectRoot as string;
        const script = options.script;
        const scriptArgs = options.args;

        if (!script) {
            this.error('Please specify a script to run.');
            return;
        }

        await linkEnvironment(projectRoot!);
        const siteDir = path.resolve(projectRoot!, 'site');

        logger.debug('Run command context:', { script, args: scriptArgs, siteDir });

        // Initialize command to default npm run
        const finalCmd = 'npm';
        let finalArgs = null;
        let execPath = null;

        // Check for module:script syntax
        if (script.includes(':')) {
            const [moduleName, scriptName] = script.split(':');
            const modulePath = path.resolve(siteDir, 'modules', moduleName);
            logger.debug(`Resolving module script: ${moduleName}:${scriptName} at ${modulePath}`);

            // Check if script exists
            const modulePkgJsonPath = path.join(modulePath, 'package.json');
            if (await fs.pathExists(modulePkgJsonPath)) {
                try {
                    const pkg = await fs.readJson(modulePkgJsonPath);
                    if (!pkg.scripts || !pkg.scripts[scriptName]) {
                        this.error(`Script ${scriptName} does not exist in module ${moduleName}`);
                        return;
                    }
                } catch (e: any) {
                    this.error(`Failed to read package.json for module ${moduleName}: ${e.message}`);
                    return;
                }
            } else {
                this.error(`Failed to find package.json for module ${moduleName}`);
                return;
            }
            finalArgs = ['run', scriptName, '--', ...scriptArgs];
            execPath = modulePath;

        } else {
            const corePkgJsonPath = path.join(siteDir, 'package.json');
            const pkg = await fs.readJson(corePkgJsonPath);
            if (!pkg.scripts || !pkg.scripts[script]) {
                this.error(`Script ${script} does not exist in Nexical core`);
                return;
            }
            finalArgs = ['run', script, '--', ...scriptArgs];
            execPath = siteDir;
        }

        logger.debug(`Executing final command: ${finalCmd} ${finalArgs.join(' ')} `);

        const child = spawn(finalCmd, finalArgs, {
            cwd: execPath,
            stdio: 'inherit',
            env: {
                ...process.env,
                FORCE_COLOR: '1'
            }
        });

        // Handle process termination to kill child
        const cleanup = () => {
            child.kill();
            process.exit();
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        await new Promise<void>((resolve) => {
            child.on('close', (code) => {
                if (code !== 0) {
                    process.exit(code || 1);
                }
                resolve();
            });
        });
    }
}
