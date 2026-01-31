import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import CleanCommand from '../../../src/commands/clean.js';
import { createTempDir, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';

describe('CleanCommand Integration', () => {
    let tempDir: string;

    beforeEach(async () => {
        tempDir = await createTempDir('clean-integration-');
        // Setup initial state
        await fs.ensureDir(path.join(tempDir, 'site'));
        await fs.outputFile(path.join(tempDir, 'site', 'index.html'), '<html></html>');
        await fs.ensureDir(path.join(tempDir, 'node_modules'));
        await fs.outputFile(path.join(tempDir, 'node_modules', 'pkg.json'), '{}');
    });

    afterAll(async () => {
        if (tempDir) await fs.remove(tempDir);
    });

    it('should remove site and node_modules directories', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        // CleanCommand expects (cli, globalOptions)
        // We pass rootDir here to ensure it's set without relying on auto-discovery in test environment
        const command = new CleanCommand(cli, { rootDir: tempDir });

        // Create project config
        await fs.outputFile(path.join(tempDir, 'nexical.yml'), 'name: test-project');

        const originalCwd = process.cwd();
        try {
            process.chdir(tempDir);

            // Use runInit to ensure checks run (which will read nexical.yml)
            console.log(`[TEST] Running clean in ${tempDir}`);
            await command.init();
            await command.runInit({ debug: true });

            console.log(`[TEST] ProjectRoot resolved to: ${(command as any).projectRoot}`);
            console.log(`[TEST] site exists? ${await fs.pathExists(path.join(tempDir, 'site'))}`);

            expect(fs.existsSync(path.join(tempDir, 'site'))).toBe(false);
            expect(fs.existsSync(path.join(tempDir, 'node_modules'))).toBe(false);
        } finally {
            process.chdir(originalCwd);
        }
    });

    it('should only remove dist if specified', async () => {
        // Assuming clean command supports args/options regarding what to clean?
        // If generic clean just follows a pattern.
        // Let's verify clean.ts logic first.
    });
});
