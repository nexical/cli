import { BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';

export default class SetupCommand extends BaseCommand {
  static description = 'Setup the application environment by symlinking core assets.';

  async run() {
    // Use projectRoot from BaseCommand if available, fallback to cwd
    const rootDir = this.projectRoot || process.cwd();

    // Verify we are in the right place
    if (!fs.existsSync(path.join(rootDir, 'core'))) {
      this.error('Could not find "core" directory. Are you in the project root?');
      process.exit(1);
    }

    const apps = ['frontend', 'backend'];
    const sharedAssets = ['prisma', 'src', 'public', 'locales', 'scripts']; // tsconfig might be needed if extended

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
          const destDir = path.dirname(dest);
          await fs.ensureDir(destDir);

          // Force remove existing destination to ensure clean replacement
          await fs.remove(dest);

          const relSource = path.relative(destDir, source);
          await fs.symlink(relSource, dest);

          logger.debug(`Symlinked ${asset} to ${app}`);
        } catch (e: unknown) {
          if (e instanceof Error) {
            this.error(`Failed to symlink ${asset} to ${app}: ${e.message}`);
          } else {
            this.error(`Failed to symlink ${asset} to ${app}: ${String(e)}`);
          }
        }
      }
    }

    this.success('Application setup complete.');
  }
}
