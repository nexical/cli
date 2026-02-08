import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createTempDir, createMockRepo, runCLI } from '../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';

describe('CLI Lifecycle E2E', () => {
    let testRoot: string;
    let starterDir: string;
    let moduleDir: string;
    let mockAstroDir: string;

    beforeEach(async () => {
        testRoot = await createTempDir('e2e-life-');

        // 1. Setup Mock "Astro" package
        // We create a local package that impersonates 'astro'.
        // This avoids npm install downloading the internet.
        mockAstroDir = path.join(testRoot, 'mock-astro');
        await fs.ensureDir(mockAstroDir);
        await fs.outputFile(path.join(mockAstroDir, 'package.json'), JSON.stringify({
            name: 'astro',
            version: '1.0.0',
            bin: {
                astro: './bin.js'
            }
        }));
        // The mock binary acts as "npx astro"
        await fs.outputFile(path.join(mockAstroDir, 'bin.js'), `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
console.log("MOCK_ASTRO_EXECUTED " + args.join(' '));

if (args[0] === 'build') {
    const dist = path.join(process.cwd(), 'dist');
    if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.html'), '<html></html>');
}
`);
        await fs.chmod(path.join(mockAstroDir, 'bin.js'), '755');

        // 2. Setup Mock Starter Repo
        starterDir = path.join(testRoot, 'starter-repo');
        // We need a package.json that points 'astro' to our mock
        await createMockRepo(starterDir, {
            'package.json': JSON.stringify({
                name: 'e2e-project',
                version: '0.0.0',
                dependencies: {
                    // Use file: protocol to point to local mock
                    'astro': `file:${mockAstroDir}`
                },
                scripts: {
                    'build': 'astro build',
                    'dev': 'astro dev',
                    'preview': 'astro preview',
                    'setup': 'echo setup'
                }
            }),
            'README.md': '# E2E Starter',
            'nexical.yml': 'name: e2e-test\nversion: 0.0.1', // ESSENTIAL for CLI to recognize project
            'src/pages/index.astro': '--- ---',
            'src/core/index.ts': '// core',
            'src/core/package.json': JSON.stringify({
                scripts: {
                    'build': 'astro build',
                    'dev': 'astro dev',
                    'preview': 'astro preview'
                }
            })
        });

        // 3. Setup Mock Module Repo
        moduleDir = path.join(testRoot, 'module-repo');
        await createMockRepo(moduleDir, {
            'package.json': JSON.stringify({ name: 'my-module', version: '0.1.0' }),
            'module.yaml': 'name: my-test-module\nversion: 0.1.0', // Name matches E2E expectation
            'index.ts': 'console.log("module")'
        });
    });

    afterAll(async () => {
        if (testRoot) await fs.remove(testRoot);
    });

    it('should complete a full project lifecycle', async () => {
        const projectDir = path.join(testRoot, 'my-project');

        const env = {
            // Essential for git inside init/module commands
            GIT_AUTHOR_NAME: 'Test User',
            GIT_AUTHOR_EMAIL: 'test@example.com',
            GIT_COMMITTER_NAME: 'Test User',
            GIT_COMMITTER_EMAIL: 'test@example.com',
            GIT_ALLOW_PROTOCOL: 'file'
            // DEBUG: 'true' - Removed to reduce noise
        };

        // --- STEP 1: INIT ---
        // Run: nexical init my-project --repo <starter>
        const initResult = await runCLI([
            'init',
            'my-project',
            '--repo', starterDir
        ], testRoot, { env });

        // 4. Check git initialization (preserved history)
        const { stdout: log } = await execa('git', ['log', '--oneline'], { cwd: projectDir });
        const lines = log.split('\n').filter(Boolean);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines[0]).toContain('Initial site commit');

        // --- STEP 2: MODULE ADD ---
        // Run: nexical module add <module>
        const modResult = await runCLI([
            'module',
            'add',
            moduleDir,
            'my-test-module' // Explicit name
        ], projectDir, { env });

        if (modResult.exitCode !== 0) {
            console.error('Module Add Failed:', modResult.stderr || modResult.stdout);
        }
        expect(modResult.exitCode).toBe(0);
        expect(fs.existsSync(path.join(projectDir, 'modules/my-test-module'))).toBe(true);

        // --- STEP 3: BUILD ---
        // Run: nexical run build
        // Should trigger our mock astro binary
        const buildResult = await runCLI(['run', 'build'], projectDir, { env });

        if (buildResult.exitCode !== 0) {
            console.log(buildResult.stderr || buildResult.stdout);
        }

        expect(buildResult.exitCode).toBe(0);
        expect(buildResult.stdout).toContain('MOCK_ASTRO_EXECUTED build');

        // --- STEP 4: PREVIEW ---
        // Run: nexical run preview
        const previewResult = await runCLI(['run', 'preview'], projectDir, { env });

        expect(previewResult.exitCode).toBe(0);
        expect(previewResult.stdout).toContain('MOCK_ASTRO_EXECUTED preview');

        // --- STEP 5: CLEAN ---
        // Clean is now handled by manual file operations or external scripts,
        // it's no longer a top-level command.

    }, 120000); // Long timeout for full chain
});
