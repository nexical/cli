import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream } from 'node:fs';
import { DeploymentError } from './types';

export const execAsync = promisify(exec);

export async function checkCommand(command: string): Promise<boolean> {
  try {
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
}

export interface SpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  logFile?: string;
  debug?: boolean;
}

export async function spawnAsync(
  command: string,
  args: string[],
  options: SpawnOptions = {},
): Promise<void> {
  const { cwd, env, logFile, debug } = options;

  return new Promise((resolve, reject) => {
    const output: string[] = [];
    const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
    const child = spawn(fullCommand, {
      cwd,
      env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const logStream = !debug && logFile ? createWriteStream(logFile, { flags: 'a' }) : null;

    child.stdout?.on('data', (data) => {
      const str = data.toString();
      output.push(str);
      if (debug) process.stdout.write(data);
      if (logStream) logStream.write(data);
    });

    child.stderr?.on('data', (data) => {
      const str = data.toString();
      output.push(str);
      if (debug) process.stderr.write(data);
      if (logStream) logStream.write(data);
    });

    child.on('close', (code) => {
      if (logStream) logStream.end();
      if (code === 0) {
        resolve();
      } else {
        const fullOutput = output.join('');
        const error = new Error(
          `Command failed with code ${code}: ${fullCommand}`,
        ) as DeploymentError;
        error.output = fullOutput;
        error.code = code;
        reject(error);
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}
