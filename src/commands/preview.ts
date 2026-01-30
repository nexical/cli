import { BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import process from 'node:process';

export default class PreviewCommand extends BaseCommand {
    static usage = 'preview';
    static description = 'Preview the production build locally.';
    static requiresProject = true;

    async run(options: any) {
        const projectRoot = this.projectRoot as string;
        const siteDir = path.resolve(projectRoot, 'site');
        const distDir = path.join(siteDir, 'dist');

        logger.debug('Preview paths:', { siteDir, distDir });

        if (!(await fs.pathExists(distDir))) {
            this.error("Please run 'nexical build' first.");
            return;
        }

        this.info('Starting preview server...');

        const astroBin = path.join(projectRoot, 'node_modules', '.bin', 'astro');
        logger.debug(`Spawning astro preview from: ${astroBin} in ${siteDir}`);

        const child = spawn(astroBin, ['preview'], {
            cwd: siteDir,
            stdio: 'inherit',
            env: {
                ...process.env,
                FORCE_COLOR: '1'
            }
        });

        child.on('error', (err) => {
            this.error(`Failed to start preview: ${err.message}`);
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
                    // exit
                }
                resolve();
            });
        });
    }
}
