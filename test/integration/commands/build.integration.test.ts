import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import BuildCommand from '../../../src/commands/build.js';
import { createTempDir, cleanupTestRoot } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { spawn, exec } from 'node:child_process';
import EventEmitter from 'node:events';

// Mock child_process
vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
    exec: vi.fn(),
}));

describe('BuildCommand Integration', () => {
    let projectDir: string;
    let spawnMock: any;
    let execMock: any;

    beforeEach(async () => {
        projectDir = await createTempDir('build-project-');
        vi.mocked(spawn).mockClear();
        vi.mocked(exec).mockClear();

        // Setup mock project structure
        await fs.ensureDir(path.join(projectDir, 'src', 'core'));
        await fs.outputFile(path.join(projectDir, 'src', 'core', 'index.astro'), '--- ---');

        await fs.ensureDir(path.join(projectDir, 'content'));
        await fs.outputFile(path.join(projectDir, 'content', 'config.ts'), 'export const collections = {};');

        await fs.ensureDir(path.join(projectDir, 'public'));
        await fs.outputFile(path.join(projectDir, 'public', 'favicon.ico'), 'icon');

        spawnMock = vi.mocked(spawn).mockImplementation(() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            setTimeout(() => child.emit('close', 0), 10);
            return child;
        });

        execMock = vi.mocked(exec).mockImplementation(((cmd: string, options: any, cb: any) => {
            const callback = cb || options;
            callback(null, { stdout: '', stderr: '' });
            return {} as any;
        }) as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        if (projectDir) await fs.remove(projectDir);
    });

    it('should assemble environment and spawn astro build', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        const command = new BuildCommand(cli);
        Object.assign(command, { projectRoot: projectDir });

        await command.run({});

        // 1. Verify site assembly
        const siteDir = path.join(projectDir, 'site');
        expect(fs.existsSync(siteDir)).toBe(true);
        expect(fs.existsSync(path.join(siteDir, 'index.astro'))).toBe(true);
        expect(fs.existsSync(path.join(siteDir, 'content', 'config.ts'))).toBe(true);
        expect(fs.existsSync(path.join(siteDir, 'public', 'favicon.ico'))).toBe(true);

        // 2. Verify exec called with local binary
        // BuildCommand uses runCommand -> exec
        expect(execMock).toHaveBeenCalledWith(
            expect.stringContaining('npm run build'),
            expect.objectContaining({
                cwd: expect.stringContaining('site')
            }),
            expect.anything()
        );
    });
});
