import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import RunCommand from '../../../src/commands/run.js';
import { createTempDir } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import EventEmitter from 'events';

vi.mock('child_process', () => ({
    spawn: vi.fn(),
    exec: vi.fn(),
}));

describe('RunCommand Integration', () => {
    let projectDir: string;
    let spawnMock: any;

    beforeEach(async () => {
        projectDir = await createTempDir('run-project-');
        vi.mocked(spawn).mockClear();

        // Setup minimal env
        await fs.ensureDir(path.join(projectDir, 'src', 'core'));
        await fs.outputFile(path.join(projectDir, 'src', 'core', 'package.json'), JSON.stringify({
            name: 'nexical-core',
            scripts: {
                'test-script': 'echo test'
            }
        }));
        await fs.ensureDir(path.join(projectDir, 'src', 'modules', 'my-auth'));
        await fs.outputFile(path.join(projectDir, 'src', 'modules', 'my-auth', 'package.json'), JSON.stringify({
            scripts: {
                'seed': 'node seed.js'
            }
        }));

        await fs.ensureDir(path.join(projectDir, 'site'));
        await fs.outputFile(path.join(projectDir, 'site', 'package.json'), JSON.stringify({
            scripts: {
                'test-script': 'echo test'
            }
        }));

        spawnMock = vi.mocked(spawn).mockImplementation(() => {
            const child: any = new EventEmitter();
            child.stdout = new EventEmitter();
            child.stderr = new EventEmitter();
            setTimeout(() => child.emit('close', 0), 10);
            child.kill = vi.fn();
            return child;
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        if (projectDir) await fs.remove(projectDir);
    });

    it('should run standard npm scripts', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        const command = new RunCommand(cli);
        Object.assign(command, { projectRoot: projectDir });

        await command.run({ script: 'test-script', args: ['--flag'] });

        expect(spawnMock).toHaveBeenCalledWith(
            'npm',
            ['run', 'test-script', '--', '--flag'],
            expect.objectContaining({
                cwd: expect.stringContaining('site')
            })
        );
    });

    it('should run module specific scripts', async () => {
        const cli = new CLI({ commandName: 'nexical' });
        const command = new RunCommand(cli);
        Object.assign(command, { projectRoot: projectDir });

        await command.run({ script: 'my-auth:seed', args: ['--force'] });

        // Module scripts run via npm run scriptName inside module dir
        expect(spawnMock).toHaveBeenCalledWith(
            'npm',
            ['run', 'seed', '--', '--force'],
            expect.objectContaining({
                cwd: expect.stringContaining(path.join('modules', 'my-auth'))
            })
        );
    });
});
