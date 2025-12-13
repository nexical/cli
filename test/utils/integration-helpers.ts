import path from "node:path";
import { execa } from "execa";
import { fileURLToPath } from "node:url";

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CLI_BIN = path.resolve(__dirname, "../../dist/index.js");

/**
 * Runs the CLI command against the compiled binary (E2E style)
 */
export async function runCLI(args: string[], cwd: string, options: any = {}) {
  return execa("node", [CLI_BIN, ...args], {
    cwd,
    ...options,
    env: {
      ...process.env,
      ...options.env,
    },
    reject: false, // Allow checking exit code in tests
  });
}
