import path from "path";
import { execa } from "execa";
import { fileURLToPath } from "node:url";
import os from 'os';
import fs from 'fs-extra';

// Constants
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_BIN = path.resolve(__dirname, '../../dist/index.js');
const TEST_API_URL = 'http://localhost:3333';
export const TEST_HOME = path.resolve(__dirname, '../../test-home');

// Ensure test home exists
if (!fs.existsSync(TEST_HOME)) {
    fs.mkdirpSync(TEST_HOME);
}

/**
 * Runs the CLI command against the compiled binary (E2E style)
 */
export async function runCLI(args: string[], options: any = {}) {
    return execa("node", [CLI_BIN, ...args], {
        cwd: options.cwd || process.cwd(),
        ...options,
        env: {
            ...process.env,
            NEXICAL_API_URL: TEST_API_URL, // Point to Mock API
            HOME: TEST_HOME, // Isolate config
            ...options.env,
        },
        reject: false, // Allow checking exit code in tests
    });
}
