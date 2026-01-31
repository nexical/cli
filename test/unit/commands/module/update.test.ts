import { logger, runCommand } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleUpdateCommand from '../../../../src/commands/module/update.js';
import fs from 'fs-extra';

vi.mock('@nexical/cli-core', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@nexical/cli-core')>();
    return {
        ...mod,
        logger: {
            ...mod.logger,
            success: vi.fn(),
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        },
        runCommand: vi.fn(),
    };
});
vi.mock('fs-extra');

describe('ModuleUpdateCommand', () => {
    let command: ModuleUpdateCommand;

    beforeEach(async () => {
        vi.clearAllMocks();
        command = new ModuleUpdateCommand({}, { rootDir: '/mock/root' });
        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'success').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'info').mockImplementation((() => { }) as any);
        vi.mocked(fs.pathExists).mockImplementation(async (p: string) => {
            if (p.includes('app.yml') || p.includes('nexical.yml')) return true;
            return true;
        });
        vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        await command.init();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should have correct static properties', () => {
        expect(ModuleUpdateCommand.usage).toContain('module update');
        expect(ModuleUpdateCommand.description).toBeDefined();
        expect(ModuleUpdateCommand.requiresProject).toBe(true);
        expect(ModuleUpdateCommand.args).toBeDefined();
    });

    it('should error if project root is missing', async () => {
        command = new ModuleUpdateCommand({}, { rootDir: undefined });
        vi.spyOn(command, 'init').mockImplementation(async () => { });
        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);

        await command.runInit({});
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('requires to be run within an app project'), 1);
    });

    it('should update all modules if no name provided', async () => {
        await command.run({});
        expect(runCommand).toHaveBeenCalledWith(
            expect.stringContaining('git submodule update --remote'),
            '/mock/root'
        );
        expect(runCommand).toHaveBeenCalledWith('npm install', '/mock/root');
    });

    it('should update specific module', async () => {
        await command.run({ name: 'mod' });
        expect(runCommand).toHaveBeenCalledWith(
            expect.stringContaining('git submodule update --remote --merge src/modules/mod'),
            '/mock/root'
        );
    });

    it('should handle failure during update', async () => {
        vi.mocked(runCommand).mockRejectedValue(new Error('Update failed'));
        await command.run({});
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to update'));
    });

    it('should error if module to update not found', async () => {
        vi.mocked(fs.pathExists).mockImplementation(async (p) => {
            // console.log('UpdateTest: pathExists check:', p);
            return false;
        });
        await command.run({ name: 'missing-mod' });
        expect(command.error).toHaveBeenCalledWith('Module missing-mod not found.');
    });
});
