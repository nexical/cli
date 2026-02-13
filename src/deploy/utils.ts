import { exec } from 'node:child_process';
import { promisify } from 'node:util';

export const execAsync = promisify(exec);

export async function checkCommand(command: string): Promise<boolean> {
  try {
    await execAsync(command);
    return true;
  } catch {
    return false;
  }
}
