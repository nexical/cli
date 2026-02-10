import { logger, runCommand } from '@nexical/cli-core';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export async function clone(
  url: string,
  destination: string,
  options: { recursive?: boolean; depth?: number } = {},
): Promise<void> {
  const { recursive = false, depth } = options;
  const cmd = `git clone ${recursive ? '--recursive ' : ''}${depth ? `--depth ${depth} ` : ''}${url} .`;
  logger.debug(`Git clone: ${url} to ${destination}`);
  await runCommand(cmd, destination);
}

export async function getRemoteUrl(cwd: string, remote = 'origin'): Promise<string> {
  try {
    const { stdout } = await execAsync(`git remote get-url ${remote}`, { cwd });
    return stdout.trim();
  } catch (e) {
    console.error('getRemoteUrl failed:', e);
    return '';
  }
}

export async function updateSubmodules(cwd: string): Promise<void> {
  logger.debug(`Updating submodules in ${cwd}`);
  await runCommand(
    'git submodule foreach --recursive "git checkout main && git pull origin main"',
    cwd,
  );
}

export async function checkoutOrphan(branch: string, cwd: string): Promise<void> {
  await runCommand(`git checkout --orphan ${branch}`, cwd);
}

export async function addAll(cwd: string): Promise<void> {
  await runCommand('git add -A', cwd);
}

export async function commit(message: string, cwd: string): Promise<void> {
  // Escape quotes in message if needed, for now assuming simple messages
  await runCommand(`git commit -m "${message}"`, cwd);
}

export async function deleteBranch(branch: string, cwd: string): Promise<void> {
  await runCommand(`git branch -D ${branch}`, cwd);
}

export async function renameBranch(branch: string, cwd: string): Promise<void> {
  await runCommand(`git branch -m ${branch}`, cwd);
}

export async function removeRemote(remote: string, cwd: string): Promise<void> {
  await runCommand(`git remote remove ${remote}`, cwd);
}

export async function renameRemote(oldName: string, newName: string, cwd: string): Promise<void> {
  await runCommand(`git remote rename ${oldName} ${newName}`, cwd);
}

export async function branchExists(branch: string, cwd: string): Promise<boolean> {
  try {
    await execAsync(`git show-ref --verify --quiet refs/heads/${branch}`, { cwd });
    return true;
  } catch {
    return false;
  }
}
