import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';
import { fileURLToPath } from 'node:url';

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TEST_ROOT = path.resolve(__dirname, '../../.test-tmp');
export const CLI_BIN = path.resolve(__dirname, '../../dist/index.js');

/**
 * Runs the CLI command against the compiled binary (E2E style)
 */
export async function runCLI(
  args: string[],
  cwd: string,
  options: { env?: NodeJS.ProcessEnv; [key: string]: unknown } = {},
) {
  return execa('node', [CLI_BIN, ...args], {
    cwd,
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
    reject: false, // Allow checking exit code in tests
  });
}

/**
 * Creates a temporary directory for testing.
 * @returns The absolute path to the temporary directory.
 */
export async function createTempDir(prefix = 'test-'): Promise<string> {
  const dir = path.join(TEST_ROOT, `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(dir);
  return dir;
}

/**
 * Cleans up the temporary test root.
 */
export async function cleanupTestRoot(): Promise<void> {
  await fs.remove(TEST_ROOT);
}

/**
 * Creates a mock git repository at the specified path.
 * This is useful for testing commands that clone from a remote.
 */
export async function createMockRepo(
  dir: string,
  initialFiles: Record<string, string> = {},
): Promise<string> {
  await fs.ensureDir(dir);

  // Initialize bare repo? No, usually we want a regular repo then commit,
  // but if we want to clone FROM it locally, it acts as a remote.
  // Let's make it a regular repo.
  await execa('git', ['init'], { cwd: dir });
  await execa('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 'Test User'], { cwd: dir });

  // Write initial files
  for (const [filename, content] of Object.entries(initialFiles)) {
    await fs.outputFile(path.join(dir, filename), content);
  }

  await execa('git', ['add', '.'], { cwd: dir });
  await execa('git', ['commit', '-m', 'Initial commit'], { cwd: dir });

  return dir;
}
