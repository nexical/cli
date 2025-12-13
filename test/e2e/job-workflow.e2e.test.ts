import { describe, it, expect, beforeAll } from 'vitest';
import { runCLI } from './utils.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { resetMockStore } from './setup.js';

describe('Job Workflow E2E', () => {
    const TEST_CONFIG_DIR = path.join(os.homedir(), '.nexical');
    const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

    beforeAll(async () => {
        resetMockStore();
        resetMockStore();
        // Ensure logged in
        await fs.mkdirp(TEST_CONFIG_DIR);
        await fs.writeJSON(TEST_CONFIG_FILE, { token: 'mock-access-token' });
    });

    it('should trigger a job', async () => {
        // We use "3" as branchId (must be numeric for CLI validation)
        const { stdout } = await runCLI(['job', 'trigger', '1', '101', '3', 'deploy']);
        expect(stdout).toContain('Job 123 triggered successfully!');
        expect(stdout).toContain('Status: pending');
    });

    it('should get job logs', async () => {
        const { stdout } = await runCLI(['job', 'logs', '1', '101', '3', '123']);
        expect(stdout).toContain('Logs for Job 123:');
        expect(stdout).toContain('Build initialized');
        expect(stdout).toContain('Build successful');
    });
});
