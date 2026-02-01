import { BaseCommand, logger } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleListCommand from '../../../../src/commands/module/list.js';
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

describe('ModuleListCommand', () => {
    let command: ModuleListCommand;
    let consoleTableSpy: any;

    beforeEach(async () => {
        vi.clearAllMocks();
        command = new ModuleListCommand({}, { rootDir: '/mock/root' });
        consoleTableSpy = vi.spyOn(console, 'table').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
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
        expect(ModuleListCommand.usage).toContain('module list');
        expect(ModuleListCommand.description).toBeDefined();
        expect(ModuleListCommand.requiresProject).toBe(true);
    });

    it('should error if project root is missing', async () => {
        command = new ModuleListCommand({}, { rootDir: undefined });
        vi.spyOn(command, 'init').mockImplementation(async () => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });

        await command.runInit({});
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('requires to be run within an app project'), 1);
    });

    it('should handle missing modules directory', async () => {
        vi.mocked(fs.pathExists).mockImplementation(async () => false);
        await command.run();
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('No modules installed'));
    });

    it('should list modules with details', async () => {
        vi.mocked(fs.readdir).mockResolvedValue(['mod1', 'file.txt', 'mod2', 'mod3', 'mod4'] as any);
        // Mock directory check: mod1=dir, file.txt=file, mod2=dir, mod3=dir
        vi.mocked(fs.stat).mockImplementation(async (p: any) => ({
            isDirectory: () => !p.includes('file.txt')
        } as any));

        // Mock package.json existence: mod1=yes, mod2=no, mod3=yes
        // Also ensure modules directory itself exists!
        vi.mocked(fs.pathExists).mockImplementation(async (p: any) => {
            if (p.includes('app.yml') || p.includes('nexical.yml')) return true;
            if (p.endsWith('/modules')) return true;
            return p.includes('package.json') && !p.includes('mod2');
        });

        // Mock reading json: mod1=valid, mod3=invalid, mod4=empty
        vi.mocked(fs.readJson).mockImplementation(async (p: any) => {
            if (p.includes('mod3')) throw new Error('Invalid JSON');
            if (p.includes('mod4')) return {}; // No version/desc
            return { version: '1.0.0', description: 'Desc' };
        });

        await command.run();

        // mod1: listed with version
        // file.txt: ignored
        // mod2: listed with unknown version (dir exists, no pkg.json)
        // mod3: listed with unknown version (invalid pkg.json)
        // mod4: listed with unknown/empty (fallback logic)
        expect(consoleTableSpy).toHaveBeenCalledWith(expect.arrayContaining([
            { name: 'mod1', version: '1.0.0', description: 'Desc' },
            { name: 'mod2', version: 'unknown', description: '' },
            { name: 'mod3', version: 'unknown', description: '' },
            { name: 'mod4', version: 'unknown', description: '' }
        ]));
    });

    it('should handle empty modules directory', async () => {
        vi.mocked(fs.readdir).mockResolvedValue([] as any);
        await command.run();
        expect(command.info).toHaveBeenCalledWith('No modules installed.');
    });

    it('should handle failure during list', async () => {
        vi.mocked(fs.readdir).mockRejectedValue(new Error('FS Error'));
        await command.run();
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to list modules'));
    });
});
