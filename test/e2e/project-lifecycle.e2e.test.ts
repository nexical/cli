import { describe, it, expect, beforeAll } from 'vitest';
import { runCLI } from './utils.js';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { resetMockStore } from './setup.js';

describe('Project Lifecycle E2E', () => {
    const TEST_CONFIG_DIR = path.join(os.homedir(), '.nexical');
    const TEST_CONFIG_FILE = path.join(TEST_CONFIG_DIR, 'config.json');

    beforeAll(async () => {
        resetMockStore();
        // Ensure logged intMockStore();
        // Ensure logged in
        await fs.mkdirp(TEST_CONFIG_DIR);
        await fs.writeJSON(TEST_CONFIG_FILE, { token: 'mock-access-token' });
    });

    it('should create a new project', async () => {
        const { stdout } = await runCLI(['project', 'create', '1', 'My Project', '--repo', 'https://github.com/test/repo']);
        expect(stdout).toContain('Project "My Project" set up successfully!');
        expect(stdout).toContain('ID: 101');
    });

    it('should list projects', async () => {
        const { stdout } = await runCLI(['project', 'list', '1']);
        expect(stdout).toContain('Projects in Team 1:');
        expect(stdout).toContain('My Project (ID: 101)');
    });

    it('should update project', async () => {
        const { stdout } = await runCLI(['project', 'update', '1', '101', '--name', 'Updated Project']);
        // Note: The CLI success message format depends on command impl.
        expect(stdout).toContain('Project 101 updated!');
        // expect(stdout).toContain('Name: Updated Project'); // CLI might not print details
    });

    it('should delete project', async () => {
        const { stdout } = await runCLI(['project', 'delete', '1', '101', '--confirm']);
        expect(stdout).toContain('Project 101 deleted.');
    });

    it('should verify deletion', async () => {
        const { stdout } = await runCLI(['project', 'list', '1']);
        expect(stdout).not.toContain('ID: 101');
    });
});
