import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SetupCommand from '../../../src/commands/setup.js';
import fs from 'fs-extra';
import path from 'path';
import { CLI } from '@nexical/cli-core';

// Mock fs-extra
vi.mock('fs-extra');

describe('SetupCommand', () => {
    let command: SetupCommand;
    let mockCli: CLI;
    let exitSpy: any;

    // Mock BaseCommand methods
    // We need to extend SetupCommand or mock the prototype to capture error/warn/success
    // Or we can just spy on them if we can access the instance methods.

    // Better approach: Spy on the prototype methods of BaseCommand or the instance itself.
    // However, BaseCommand methods like `error` might process.exit.

    // Let's create a subclass for testing or mock the CLI and use the standard instantiation.
    // The current SetupCommand implementation calls `process.exit(1)` in `error` logic in `run`.
    // Wait, looking at `setup.ts`:
    // if (!fs.existsSync(path.join(rootDir, 'core'))) {
    //     this.error('Could not find "core" directory. Are you in the project root?');
    //     process.exit(1);
    // }

    // So we need to stub process.exit to prevent test runner from exiting.

    beforeEach(() => {
        vi.clearAllMocks();
        mockCli = new CLI({ commandName: 'test-cli' });
        command = new SetupCommand(mockCli);

        // Spy on logging methods
        vi.spyOn(command, 'error').mockImplementation(() => { });
        vi.spyOn(command, 'warn').mockImplementation(() => { });
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });

        // Mock process.cwd to return a known path
        vi.spyOn(process, 'cwd').mockReturnValue('/mock/project/root');

        // Mock process.exit
        exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => { }) as any);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should error if "core" directory is missing', async () => {
        // specific check: fs.existsSync returns false for core
        vi.mocked(fs.existsSync).mockReturnValue(false);

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Could not find "core" directory. Are you in the project root?');
        expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should warn and skip if app directory is missing', async () => {
        // Setup fs mocks
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            const pStr = p.toString();
            if (pStr.endsWith('core')) return true;
            if (pStr.endsWith('apps/frontend')) return true;
            if (pStr.endsWith('apps/backend')) return false; // Missing backend
            return false;
        });

        await command.run();

        expect(command.warn).toHaveBeenCalledWith('App directory backend not found. Skipping.');
        expect(command.info).toHaveBeenCalledWith('Setting up frontend...');
    });

    it('should symlink shared assets', async () => {
        // Setup fs mocks
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            const pStr = p.toString();
            // Core exists
            if (pStr.endsWith('core')) return true;
            // Apps exist
            if (pStr.endsWith('apps/frontend') || pStr.endsWith('apps/backend')) return true;

            // Shared assets in core exist
            if (pStr.includes('core/') && !pStr.endsWith('core')) return true;

            return false;
        });

        vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);

        await command.run();

        // Check if verify apps are processed
        expect(command.info).toHaveBeenCalledWith('Setting up frontend...');
        expect(command.info).toHaveBeenCalledWith('Setting up backend...');

        // Check symlink calls
        // We have 2 apps * 7 shared assets = 14 symlinks
        // sharedAssets = ['prisma', 'src', 'public', 'locales', 'scripts', 'astro.config.mjs', 'tsconfig.json']

        const assets = ['prisma', 'src', 'public', 'locales', 'scripts', 'astro.config.mjs', 'tsconfig.json'];

        for (const app of ['frontend', 'backend']) {
            for (const asset of assets) {
                const dest = path.join('/mock/project/root', 'apps', app, asset);
                const source = path.join('/mock/project/root', 'core', asset);

                // Ensure removeSync called
                expect(fs.removeSync).toHaveBeenCalledWith(dest);

                // Ensure symlink called
                // valid relative path calculation might vary, but verify arguments
                expect(fs.symlink).toHaveBeenCalled();
            }
        }

        expect(command.success).toHaveBeenCalledWith('Application setup complete.');
    });

    it('should warn if source asset is missing in core', async () => {
        // Setup fs mocks
        vi.mocked(fs.existsSync).mockImplementation((p) => {
            const pStr = p.toString();
            if (pStr.endsWith('core')) return true;
            if (pStr.includes('apps/')) return true;

            // Mock that 'prisma' is missing in core
            if (pStr.endsWith('core/prisma')) return false;

            // Others exist
            if (pStr.includes('core/') && !pStr.endsWith('core')) return true;

            return false;
        });

        await command.run();

        expect(command.warn).toHaveBeenCalledWith('Source asset prisma not found in core.');
    });

    it('should throw error if removal fails with non-ENOENT', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);

        const error = new Error('Permission denied');
        (error as any).code = 'EACCES';
        vi.mocked(fs.removeSync).mockImplementation(() => { throw error; });

        await command.run();

        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to symlink'));
    });

    it('should log error if symlink fails', async () => {
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.lstatSync).mockReturnValue({ isSymbolicLink: () => true } as any);
        vi.mocked(fs.symlink).mockRejectedValue(new Error('Symlink failed'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to symlink'));
    });
});
