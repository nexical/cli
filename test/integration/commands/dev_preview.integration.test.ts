import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import DevCommand from '../../../src/commands/dev.js';
import PreviewCommand from '../../../src/commands/preview.js';
import { createTempDir } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { spawn, exec } from 'child_process';
import EventEmitter from 'events';

vi.mock('child_process', () => ({
    spawn: vi.fn(),
    exec: vi.fn(),
}));

describe('Dev/Preview Integration', () => {
    let projectDir: string;
    let spawnMock: any;

    beforeEach(async () => {
        projectDir = await createTempDir('dev-preview-');
        vi.mocked(spawn).mockClear();
        await fs.ensureDir(path.join(projectDir, 'src', 'core'));
        // Preview command checks for site/dist
        await fs.ensureDir(path.join(projectDir, 'site', 'dist'));

        spawnMock = vi.mocked(spawn).mockImplementation(() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            child.kill = vi.fn();
            setTimeout(() => child.emit('close', 0), 10);
            return child;
        });

        vi.mocked(exec).mockImplementation(((cmd: string, options: any, cb: any) => {
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

    it('dev command should spawn astro dev', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        const command = new DevCommand(cli);
        Object.assign(command, { projectRoot: projectDir });

        await command.run({});

        expect(spawnMock).toHaveBeenCalledWith(
            expect.stringContaining('node_modules/.bin/astro'),
            ['dev'],
            expect.objectContaining({
                cwd: expect.stringContaining('site')
            })
        );
    });

    it('preview command should spawn astro preview', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        const command = new PreviewCommand(cli);
        Object.assign(command, { projectRoot: projectDir });

        await command.run({});

        expect(spawnMock).toHaveBeenCalledWith(
            expect.stringContaining('node_modules/.bin/astro'),
            ['preview'],
            expect.objectContaining({
                cwd: expect.stringContaining('site')
            })
        );
    });
});
