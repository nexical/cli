import { describe, it, expect, beforeAll } from 'vitest';
import { runCLI, TEST_HOME } from './utils.js';
import { resetMockStore } from './setup.js';
import fs from 'fs-extra';
import path from 'path';

describe('Authentication E2E', () => {
    // Isolate config for tests
    const TEST_CONFIG_DIR = path.join(TEST_HOME, '.nexical');
    const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

    beforeAll(async () => {
        resetMockStore();
        // Clean up any existing config
        if (await fs.pathExists(TEST_CONFIG_FILE)) {
            await fs.remove(TEST_CONFIG_FILE);
        }
    });

    it('should show not logged in initially', async () => {
        const { stdout } = await runCLI(['whoami']);
        expect(stdout).toContain('Not logged in or token expired');
    });

    it('should login successfully', async () => {
        // Simulate login
        // Since login is interactive (browser open), we might mock the open module or 
        // just trust runCLI can handle the non-interactive part until the prompt.
        // However, key to this test is that we can MANUALLY set the token via CLI 
        // OR we just simulate the token save if the CLI doesn't support non-interactive login easily.

        // For E2E of the CLI 'login' command specifically, it's hard without a browser.
        // But we can verify "whoami" works IF we have a token.

        // Let's manually inject a token to simulate a successful login state for now
        // as true E2E of OAuth device flow requires browser automation which is out of scope.

        await fs.mkdirp(TEST_CONFIG_DIR);
        await fs.writeJSON(TEST_CONFIG_FILE, { token: 'mock-access-token' });

        const { stdout } = await runCLI(['whoami']);
        expect(stdout).toContain('Logged in as:');
        expect(stdout).toContain('Name:  Test User');
        expect(stdout).toContain('Email: test@example.com');
    });
});
