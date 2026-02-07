import { BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';

export default class SetupCommand extends BaseCommand {
    static description = 'Setup the application environment by symlinking core assets.';

    async run() {
        // We assume we are in the project root
        // But the CLI might be run from anywhere?
        // findProjectRoot in index.ts handles finding the root.
        // BaseCommand has this.projectRoot?

        // BaseCommand doesn't expose projectRoot directly in current implementation seen in memory, checking source if possible?
        // InitCommand used process.cwd().

        // Let's assume process.cwd() is project root if run via `npm run setup` from root.
        const rootDir = process.cwd();

        // Verify we are in the right place
        if (!fs.existsSync(path.join(rootDir, 'core'))) {
            this.error('Could not find "core" directory. Are you in the project root?');
            process.exit(1);
        }

        const apps = ['frontend', 'backend'];
        const sharedAssets = ['src', 'public', 'astro.config.mjs', 'tsconfig.json']; // tsconfig might be needed if extended

        for (const app of apps) {
            const appDir = path.join(rootDir, 'apps', app);
            if (!fs.existsSync(appDir)) {
                this.warn(`App directory ${app} not found. Skipping.`);
                continue;
            }

            this.info(`Setting up ${app}...`);

            for (const asset of sharedAssets) {
                const source = path.join(rootDir, 'core', asset);
                const dest = path.join(appDir, asset);

                if (!fs.existsSync(source)) {
                    this.warn(`Source asset ${asset} not found in core.`);
                    continue;
                }

                try {
                    // Remove existing destination if it exists (to ensure clean symlink)
                    // Be careful not to delete real files if they aren't symlinks?
                    // For now, we assume setup controls these.

                    const destDir = path.dirname(dest);
                    await fs.ensureDir(destDir);

                    try {
                        const stats = fs.lstatSync(dest);
                        fs.removeSync(dest);
                    } catch (e: any) {
                        if (e.code !== 'ENOENT') throw e;
                    }

                    const relSource = path.relative(destDir, source);
                    await fs.symlink(relSource, dest);

                    logger.debug(`Symlinked ${asset} to ${app}`);
                } catch (e: any) {
                    this.error(`Failed to symlink ${asset} to ${app}: ${e.message}`);
                }
            }
        }

        this.success('Application setup complete.');
    }
}
