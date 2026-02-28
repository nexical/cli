import path from 'node:path';
import { BaseCommand, runCommand } from '@nexical/cli-core';
import { ConfigManager } from '../deploy/config-manager.js';
import { AppConfig } from '../deploy/types.js';
import fs from 'fs-extra';
import { spawn, ChildProcess } from 'node:child_process';
import process from 'node:process';
import { EnvManager } from '../utils/env-manager.js';
import dotenv from 'dotenv';
import SetupCommand from './setup.js';
export default class StartCommand extends BaseCommand {
  static usage = 'start';
  static description = 'Initialize and start the local development environment.';

  static args = {
    options: [
      {
        name: '--apps <apps>',
        description: 'Comma separated list of applications to start',
      },
      {
        name: '--skip-init',
        description: 'Skip the initialization phase (npm install, db:up)',
        default: false,
      },
    ],
  };

  async run(options: { apps?: string; skipInit?: boolean }) {
    const projectRoot = this.projectRoot || process.cwd();
    const skipInit = !!options.skipInit;

    this.info('🚀 Initializing Nexical Dev Environment...');

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

    if (!skipInit) {
      // 1. npm install in project root
      this.info('📦 Installing dependencies...');
      try {
        await runCommand('npm install', projectRoot);
      } catch (e: unknown) {
        this.error(`Failed to install dependencies: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }

      // 2. Start database if compose.db.yml exists
      const dbComposePath = path.join(projectRoot, 'compose.db.yml');
      if (await fs.pathExists(dbComposePath)) {
        this.info('🗄️ Starting local database...');
        try {
          await runCommand('npm run db:up', projectRoot);
        } catch (e: unknown) {
          this.error(`Failed to start database: ${e instanceof Error ? e.message : String(e)}`);
          // Continue anyway, as DB might be already running or handled externally
        }
      }
    }

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
      }
    }

    if (apps.length === 0) {
      this.error('No applications found to start. Please check nexical.yaml.');
      return;
    }

    this.info(`✨ Starting ${apps.length} applications in parallel...`);

    // Ensure symlinks for all apps before starting
    await envManager.ensureSymlinks(projectRoot, apps);

    const processes: { name: string; child: ChildProcess }[] = [];

    for (const app of apps) {
      const appPath = app.target ? path.resolve(projectRoot, app.target) : projectRoot;

      // Check if package.json has dev script
      const pkgPath = path.join(appPath, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        const pkg = await fs.readJson(pkgPath);
        if (!pkg.scripts || !pkg.scripts.dev) {
          this.warn(`No "dev" script found in ${appPath}. Skipping ${app.name}.`);
          continue;
        }
      } else {
        this.warn(`package.json not found in ${appPath}. Skipping ${app.name}.`);
        continue;
      }

      this.info(`▶️ Starting ${app.name}...`);

      // Build environment variables with placeholder resolution
      const devEnv: Record<string, string> = {
        ...process.env,
        FORCE_COLOR: '1',
      };

      // Resolve placeholders in app.env
      const resolveValue = (value: string): string => {
        return value.replace(/\{\{apps\.([^.]+)\.dev\.port\}\}/g, (_, appName) => {
          const targetApp = apps.find((a) => a.name === appName);
          return targetApp?.dev?.port?.toString() || '';
        });
      };

      if (app.dev?.port) {
        devEnv.PORT = app.dev.port.toString();
        this.info(`  Assigned PORT=${devEnv.PORT} for ${app.name}`);
      }

      const rawEnv = app.env || {};
      for (const [key, value] of Object.entries(rawEnv)) {
        devEnv[key] = resolveValue(value);
        if (devEnv[key] !== value) {
          this.info(`  Resolved ${key}=${devEnv[key]} for ${app.name}`);
        }
      }

      const args = ['run', 'dev'];
      if (devEnv.PORT) {
        args.push('--', '--port', devEnv.PORT);
      }

      const child = spawn('npm', args, {
        cwd: appPath,
        stdio: 'pipe',
        env: devEnv,
        shell: true,
      });

      const prefix = `[\x1b[36m${app.name}\x1b[0m] `;

      child.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            process.stdout.write(prefix + line + '\n');
          }
        });
      });

      child.stderr?.on('data', (data) => {
        const errorPrefix = `[\x1b[31m${app.name}\x1b[0m] `;
        const lines = data.toString().split('\n');
        lines.forEach((line: string) => {
          if (line.trim()) {
            process.stderr.write(errorPrefix + line + '\n');
          }
        });
      });

      child.on('error', (err) => {
        this.error(`Failed to start ${app.name}: ${err.message}`);
      });

      child.on('exit', (code) => {
        if (code !== 0 && code !== null) {
          this.error(`${app.name} exited with code ${code}`);
        }
      });

      processes.push({ name: app.name, child });
    }

    if (processes.length === 0) {
      this.error('No processes were started.');
      return;
    }

    // Handle cleanup
    const cleanup = () => {
      this.info('\n🛑 Stopping all applications...');
      for (const p of processes) {
        try {
          p.child.kill('SIGTERM');
        } catch {
          // Ignore kill errors
        }
      }
      process.exit();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep the process alive
    if (process.env.NODE_ENV !== 'test') {
      await new Promise<void>(() => {
        // Never resolves
      });
    }
  }
}
