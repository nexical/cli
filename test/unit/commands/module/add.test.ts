import { logger, runCommand } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleAddCommand from '../../../../src/commands/module/add.js';
import fs from 'fs-extra';
import * as git from '../../../../src/utils/git.js';

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
vi.mock('../../../../src/utils/git.js', () => ({
    clone: vi.fn(),
    updateSubmodules: vi.fn(),
    checkoutOrphan: vi.fn(),
    addAll: vi.fn(),
    commit: vi.fn(),
    deleteBranch: vi.fn(),
    renameBranch: vi.fn(),
    removeRemote: vi.fn(),
    branchExists: vi.fn(),
    renameRemote: vi.fn(),
    getRemoteUrl: vi.fn()
}));

describe('ModuleAddCommand', () => {
    let command: ModuleAddCommand;

    beforeEach(async () => {
        vi.clearAllMocks();
        command = new ModuleAddCommand({}, { rootDir: '/mock/root' });
        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'success').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'info').mockImplementation((() => { }) as any);

        // Setup mocks
        vi.mocked(fs.ensureDir).mockImplementation(async () => { });
        vi.mocked(fs.remove).mockImplementation(async () => { });
        vi.mocked(fs.pathExists).mockImplementation(async (p: string) => {
            // We don't rely on this for init anymore since we force projectRoot
            return false;
        });
        vi.mocked(fs.readFile).mockResolvedValue('name: test-module\n' as any);

        // Mock git default behaviors
        vi.mocked(git.clone).mockResolvedValue(undefined as any);
        vi.mocked(git.getRemoteUrl).mockResolvedValue('' as any);

        // Force project root
        await command.init();
        (command as any).projectRoot = '/mock/root';
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should have correct static properties', () => {
        expect(ModuleAddCommand.usage).toContain('module add');
        expect(ModuleAddCommand.description).toBeDefined();
        expect(ModuleAddCommand.requiresProject).toBe(true);
        expect(ModuleAddCommand.args).toBeDefined();
    });

    it('should error if project root is missing', async () => {
        command = new ModuleAddCommand({}, { rootDir: undefined });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        // Ensure init doesn't set it (mocked in beforeEach but this constructor overrides logic?)
        // In beforeEach, we call command.init() then set projectRoot. 
        // Here we just created new command.
        vi.spyOn(command, 'init').mockImplementation(async () => { });

        await command.runInit({ url: 'arg' });
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('requires to be run within an app project'), 1);
    });

    it('should handle gh@ syntax with .git suffix', async () => {
        // We mock fs.pathExists to return false for targetDir to trigger install
        // return true for stagingDir to simulate clone success
        // return true for module.yaml check
        vi.mocked(fs.pathExists).mockResolvedValue(false as any); // Default

        await command.run({ url: 'gh@org/repo.git' }); // With .git suffix

        // Should NOT append another .git
        expect(git.clone).toHaveBeenCalledWith(
            'https://github.com/org/repo.git',
            expect.any(String),
            expect.objectContaining({ depth: 1 })
        );
    });

    it('should error if url is missing', async () => {
        await command.run({ url: undefined });
        expect(command.error).toHaveBeenCalledWith('Please specify a repository URL.');
    });

    it('should error if module.yaml is missing', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(false as any); // No yaml found
        await command.run({ url: 'https://github.com/org/repo.git' });
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('No module.yaml found'));
    });

    it('should error if module.yaml is missing in subdirectory', async () => {
        vi.mocked(fs.pathExists).mockResolvedValue(false as any); // No yaml

        // We mocked fs.pathExists to return false for everything in this test setup unless selective
        // But the run() logic:
        // await clone(...)
        // if (subPath) ...
        // if (!exists) throw

        await command.run({ url: 'https://github.com/org/repo.git//subdir' });
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('No module.yaml found in https://github.com/org/repo.git//subdir'));
    });

    it('should error if name is missing in module.yaml', async () => {
        vi.mocked(fs.pathExists).mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any);
        vi.mocked(fs.readFile).mockResolvedValueOnce('dependencies: []' as any); // No name
        await command.run({ url: 'https://github.com/org/repo.git' });
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('missing \'name\' in module.yaml'));
    });

    it('should handle generic errors during install', async () => {
        vi.mocked(git.clone).mockRejectedValue(new Error('Clone failed'));
        await command.run({ url: 'https://github.com/org/repo.git' });
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to add module: Clone failed'));
    });

    it('should install a module using git submodule add', async () => {
        vi.mocked(fs.pathExists).mockResolvedValueOnce(false as any); // Staging yaml
        vi.mocked(fs.pathExists).mockResolvedValueOnce(true as any);  // module.yaml in staging exists
        vi.mocked(fs.readFile).mockResolvedValueOnce('name: my-module\n' as any);

        await command.run({ url: 'https://github.com/org/repo.git' });

        expect(git.clone).toHaveBeenCalledWith(
            'https://github.com/org/repo.git',
            expect.stringContaining('staging-'),
            { depth: 1 }
        );

        // Should use submodule add
        expect(runCommand).toHaveBeenCalledWith(
            expect.stringContaining('git submodule add https://github.com/org/repo.git modules/my-module'),
            '/mock/root'
        );

        expect(runCommand).toHaveBeenCalledWith('npm install', '/mock/root');
        expect(command.success).toHaveBeenCalledWith('All modules installed successfully.');
    });

    it('should recursively install dependencies', async () => {
        // First module calls
        vi.mocked(fs.pathExists)
            .mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any) // module 1 yaml exists
            .mockResolvedValueOnce(false as any) // target dir check
            .mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any) // module 2 yaml exists
            .mockResolvedValueOnce(false as any); // target dir check

        vi.mocked(fs.readFile)
            .mockResolvedValueOnce('name: parent\ndependencies:\n  - gh@org/child' as any)
            .mockResolvedValueOnce('name: child' as any);

        await command.run({ url: 'gh@org/parent' });

        // Should clone parent
        expect(git.clone).toHaveBeenCalledWith(
            expect.stringContaining('parent.git'),
            expect.anything(),
            expect.anything()
        );
        // Should clone child
        expect(git.clone).toHaveBeenCalledWith(
            expect.stringContaining('child.git'),
            expect.anything(),
            expect.anything()
        );

        expect(runCommand).toHaveBeenCalledTimes(3); // 2 submodules + npm install
    });

    it('should handle object-style dependencies', async () => {
        vi.mocked(fs.pathExists)
            .mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any) // module exists
            .mockResolvedValueOnce(false as any); // target dir check

        vi.mocked(fs.readFile)
            .mockResolvedValueOnce('name: parent\ndependencies:\n  gh@org/child: main' as any); // Object style

        await command.run({ url: 'gh@org/parent' });

        expect(git.clone).toHaveBeenCalledTimes(2); // parent + child
    });

    it('should detect conflicts (installed but different origin)', async () => {
        vi.mocked(fs.pathExists).mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any); // staging yaml
        vi.mocked(fs.readFile).mockResolvedValueOnce('name: conflict-mod' as any);

        // Target dir check returns true (exists)
        vi.mocked(fs.pathExists).mockResolvedValueOnce(true as any);

        // Origin check returns different URL
        vi.mocked(git.getRemoteUrl).mockResolvedValueOnce('https://other.com/repo.git' as any);

        await command.run({ url: 'https://github.com/org/repo.git' });

        expect(command.error).toHaveBeenCalledWith(
            expect.stringContaining('Dependency Conflict! Module \'conflict-mod\' exists but remote')
        );
    });

    it('should skip installation if same module/origin already exists', async () => {
        vi.mocked(fs.pathExists).mockResolvedValueOnce(false as any).mockResolvedValueOnce(true as any); // staging yaml
        vi.mocked(fs.readFile).mockResolvedValueOnce('name: existing-mod' as any);
        vi.mocked(fs.pathExists).mockResolvedValueOnce(true as any); // Exists
        vi.mocked(git.getRemoteUrl).mockResolvedValueOnce('https://github.com/org/repo.git' as any); // Same URL

        await command.run({ url: 'https://github.com/org/repo.git' });

        expect(command.info).toHaveBeenCalledWith('Module existing-mod already installed.');
        // Should NOT call submodule add
        expect(runCommand).not.toHaveBeenCalledWith(expect.stringContaining('git submodule add'), expect.anything());
        // But SHOULD call npm install at end
        expect(runCommand).toHaveBeenCalledWith('npm install', '/mock/root');
    });

    it('should handle circular dependencies', async () => {
        // Module A depends on B, B depends on A
        // A
        vi.mocked(fs.pathExists).mockResolvedValue(true as any); // Simplify pathExists to always true for yamls
        vi.mocked(fs.readFile)
            .mockResolvedValueOnce('name: mod-a\ndependencies:\n  - gh@org/mod-b' as any)
            .mockResolvedValueOnce('name: mod-b\ndependencies:\n  - gh@org/mod-a' as any);

        // Target dir checks (false = not installed)
        // We need to carefully mock pathExists sequence or use implementation based on path
        vi.mocked(fs.pathExists).mockImplementation(async (p: string) => {
            if (p.includes('modules')) return false; // Not installed yet
            return true; // Yaml exists
        });

        await command.run({ url: 'gh@org/mod-a' });

        // Should install A and B, then see A again and skip
        expect(git.clone).toHaveBeenCalledTimes(2);
        // Should succeed
        expect(command.success).toHaveBeenCalled();
    });
});

