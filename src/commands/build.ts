import path from 'node:path';
import { BaseCommand, runCommand } from '@nexical/cli-core';
import { ConfigManager } from '../deploy/config-manager.js';
import { AppConfig } from '../deploy/types.js';
import fs from 'fs-extra';
import process from 'node:process';
import { EnvManager } from '../utils/env-manager.js';
import dotenv from 'dotenv';
import SetupCommand from './setup.js';

export default class BuildCommand extends BaseCommand {
  static usage = 'build';
  static description = 'Build the applications defined in nexical.yaml for production.';

  static args = {
    options: [
      {
        name: '--apps <apps>',
        description: 'Comma separated list of applications to build',
      },
    ],
  };

  async run(options: { apps?: string }) {
    const projectRoot = this.projectRoot || process.cwd();

    this.info('🚀 Preparing Nexical Build Environment...');

    const envManager = new EnvManager(this);

    // 0. Ensure environment variables and symlinks
    await envManager.ensureEnv(projectRoot);

    // Load root .env into CLI process early to ensure variables are available for config and apps
    dotenv.config({ path: path.join(projectRoot, '.env') });

    // 1. Run Nexical CLI setup command
    this.info('⚙️ Running setup command...');
    const setup = new SetupCommand(this.cli, { ...this.globalOptions, rootDir: projectRoot });
    await setup.init();
    await setup.run();

    // Load configuration
    const configManager = new ConfigManager(projectRoot);
    const config = await configManager.load();

    // Resolve Applications
    const appsMap = config.deploy?.apps || {};
    let apps: AppConfig[] = Object.entries(appsMap).map(([name, appConfig]) => {
      const app: AppConfig = {
        ...(appConfig as unknown as AppConfig),
        name,
      };
      return app;
    });

    // Filter applications if --apps is specified
    const selectedApps = options.apps;
    if (selectedApps) {
      const appNames = selectedApps.split(',').map((s) => s.trim());
      apps = apps.filter((app) => appNames.includes(app.name));

      // Validation
      const missingApps = appNames.filter((name) => !apps.find((app) => app.name === name));
      if (missingApps.length > 0) {
        this.error(
          `The following applications were not found in nexical.yaml: ${missingApps.join(', ')}`,
        );
        process.exit(1);
      }
    }

    if (apps.length === 0) {
      this.error('No applications found to build. Please check nexical.yaml.');
      return;
    }

    this.info(`✨ Building ${apps.length} applications...`);

    // Ensure symlinks for all apps before building
    await envManager.ensureSymlinks(projectRoot, apps);

    // Run build sequentially
    for (const app of apps) {
      const appPath = app.target ? path.resolve(projectRoot, app.target) : projectRoot;

      // Check if package.json has build script
      const pkgPath = path.join(appPath, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath);
        if (!pkg.scripts || !pkg.scripts.build) {
          this.warn(`No "build" script found in ${appPath}. Skipping ${app.name}.`);
          continue;
        }
      } else {
        this.warn(`package.json not found in ${appPath}. Skipping ${app.name}.`);
        continue;
      }

      this.info(`▶️ Building ${app.name}...`);

      try {
        await runCommand('npm run build', appPath);
        this.success(`✅ Successfully built ${app.name}`);
      } catch (e: unknown) {
        if (e instanceof Error) {
          this.error(`❌ Failed to build ${app.name}: ${e.message}`);
        } else {
          this.error(`❌ Failed to build ${app.name}: ${String(e)}`);
        }
        process.exit(1);
      }
    }

    this.success('🎉 All builds completed successfully!');
  }
}
