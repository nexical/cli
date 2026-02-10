import { type CommandDefinition, BaseCommand, logger } from '@nexical/cli-core';
import fs from 'fs-extra';
import path from 'path';
import { spawn } from 'child_process';
import process from 'node:process';

export default class RunCommand extends BaseCommand {
  static usage = 'run <script> [args...]';
  static description = 'Run a script inside the Nexical environment.';
  static requiresProject = true;

  static args: CommandDefinition = {
    args: [
      {
        name: 'script',
        required: true,
        description: 'The script to run (script-name OR module:script-name)',
      },
      { name: 'args...', required: false, description: 'Arguments for the script' },
    ],
  };

  async run(options: { script: string; args?: string[] }) {
    const projectRoot = this.projectRoot as string;
    const script = options.script;
    const scriptArgs = options.args || [];

    if (!script) {
      this.error('Please specify a script to run.');
      return;
    }

    logger.debug('Run command context:', { script, args: scriptArgs, projectRoot });

    let execPath = projectRoot;
    let scriptName = script;

    // Handle module:script syntax
    if (script.includes(':')) {
      const [moduleName, name] = script.split(':');
      execPath = path.resolve(projectRoot, 'modules', moduleName);
      scriptName = name;

      logger.debug(`Resolving module script: ${moduleName}:${scriptName} at ${execPath}`);
    } else {
      logger.debug(`Resolving core script: ${scriptName} at ${execPath}`);
    }

    // Validate script existence
    const pkgJsonPath = path.join(execPath, 'package.json');
    if (!(await fs.pathExists(pkgJsonPath))) {
      this.error(`Failed to find package.json at ${execPath}`);
      return;
    }

    try {
      const pkg = await fs.readJson(pkgJsonPath);
      if (!pkg.scripts || !pkg.scripts[scriptName]) {
        const type = script.includes(':') ? `module ${script.split(':')[0]}` : 'Nexical core';
        this.error(`Script "${scriptName}" does not exist in ${type}`);
        return;
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        this.error(`Failed to read package.json at ${execPath}: ${e.message}`);
      } else {
        this.error(`Failed to read package.json at ${execPath}: ${String(e)}`);
      }
      return;
    }

    const finalArgs = ['run', scriptName, '--', ...scriptArgs];
    logger.debug(`Executing: npm ${finalArgs.join(' ')} in ${execPath}`);

    const child = spawn('npm', finalArgs, {
      cwd: execPath,
      stdio: 'inherit',
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
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
        // Remove listeners to prevent memory leaks if this command is run multiple times in-process (e.g. tests)
        process.off('SIGINT', cleanup);
        process.off('SIGTERM', cleanup);

        if (code !== 0) {
          process.exit(code || 1);
        }
        resolve();
      });
    });
  }
}
