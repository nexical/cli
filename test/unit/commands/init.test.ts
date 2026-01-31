import { logger, runCommand } from '@nexical/cli-core';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import InitCommand from '../../../src/commands/init.js';
import * as git from '../../../src/utils/git.js';
import fs from 'fs-extra';

vi.mock('@nexical/cli-core', async (importOriginal) => {
    const mod = await importOriginal<typeof import('@nexical/cli-core')>();
    return {
        ...mod,
        runCommand: vi.fn(),
        logger: { code: vi.fn(), debug: vi.fn(), error: vi.fn(), success: vi.fn(), info: vi.fn(), warn: vi.fn() }
    }
});

vi.mock('../../../src/utils/git.js', () => ({
    clone: vi.fn(),
    updateSubmodules: vi.fn(),
    checkoutOrphan: vi.fn(),
    addAll: vi.fn(),
    commit: vi.fn(),
    deleteBranch: vi.fn(),
    renameBranch: vi.fn(),
    removeRemote: vi.fn(),
    branchExists: vi.fn()
}));

vi.mock('fs-extra');

describe('InitCommand', () => {
    let command: InitCommand;
    // Spy on process.exit but rely on catching the error if it throws (default vitest behavior)
    // or mock it to throw a custom error we can check.
    let mockExit: any;

    beforeEach(() => {
        vi.clearAllMocks();
        command = new InitCommand({});

        vi.spyOn(command, 'error').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'info').mockImplementation((() => { }) as any);
        vi.spyOn(command, 'success').mockImplementation((() => { }) as any);

        // Default fs mocks
        vi.mocked(fs.pathExists as any).mockResolvedValue(false); // Target not exist
        vi.mocked(fs.mkdir).mockResolvedValue(undefined);
        vi.mocked(fs.readdir).mockResolvedValue([] as any);
        vi.mocked(fs.copy).mockResolvedValue(undefined);
        vi.mocked(fs.ensureDir).mockResolvedValue(undefined);

        // Mock process.exit to throw a known error so we can stop execution and verify it
        mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`Process.exit(${code})`);
        });
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should have correct metadata', () => {
        expect(InitCommand.description).toBeDefined();
        expect(InitCommand.args).toBeDefined();
        expect(InitCommand.requiresProject).toBe(false);
    });

    it('should initialize project with default repo', async () => {
        const targetDir = 'new-project';
        vi.mocked(git.branchExists).mockResolvedValue(true);
        await command.run({ directory: targetDir, repo: 'https://default.com/repo' });

        expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining(targetDir), { recursive: true });

        // Clone
        expect(git.clone).toHaveBeenCalledWith('https://default.com/repo.git', expect.stringContaining(targetDir), { recursive: true });

        // Submodules
        expect(git.updateSubmodules).toHaveBeenCalledWith(expect.stringContaining(targetDir));

        // Npm install
        expect(runCommand).toHaveBeenCalledWith(
            'npm install',
            expect.stringContaining(targetDir)
        );

        // History wipe
        vi.mocked(git.branchExists).mockResolvedValue(true);

        expect(git.checkoutOrphan).toHaveBeenCalledWith('new-main', expect.stringContaining(targetDir));
        expect(git.addAll).toHaveBeenCalledWith(expect.stringContaining(targetDir));
        expect(git.commit).toHaveBeenCalledWith('Initial commit', expect.stringContaining(targetDir));

        // Wait for potential async calls to finish
        expect(git.branchExists).toHaveBeenCalledWith('main', expect.stringContaining(targetDir));
        expect(git.branchExists).toHaveBeenCalledWith('master', expect.stringContaining(targetDir));

        expect(git.deleteBranch).toHaveBeenCalledTimes(2); // main and master
        expect(git.renameBranch).toHaveBeenCalledWith('main', expect.stringContaining(targetDir));
        expect(git.removeRemote).toHaveBeenCalledWith('origin', expect.stringContaining(targetDir));

        // Seeding check: Should check for core being present
        expect(fs.pathExists).toHaveBeenCalledWith(expect.stringContaining('src/core/public-default'));

        expect(command.success).toHaveBeenCalledWith(expect.stringContaining('successfully'));
    });

    it('should seed project with core defaults', async () => {
        const targetDir = 'seeded-project';
        vi.mocked(git.branchExists).mockResolvedValue(true);

        // Simulate core folders existing
        vi.mocked(fs.pathExists as any).mockImplementation(async (p: string) => {
            if (p.includes('src/core/public-default')) return true;
            if (p.includes('src/core/content-default')) return true;
            return false;
        });

        await command.run({ directory: targetDir, repo: 'foo' });

        // Public seed
        expect(fs.copy).toHaveBeenCalledWith(
            expect.stringContaining('src/core/public-default'),
            expect.stringContaining('public'),
            expect.objectContaining({ overwrite: false })
        );

        // Content seed
        expect(fs.copy).toHaveBeenCalledWith(
            expect.stringContaining('src/core/content-default'),
            expect.stringContaining('content'),
            expect.objectContaining({ overwrite: false })
        );

        // Should NOT refer to src/content anymore
        expect(fs.copy).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.stringContaining('src/content'),
            expect.anything()
        );
    });

    it('should handle gh@ syntax', async () => {
        const targetDir = 'gh-project';
        await command.run({ directory: targetDir, repo: 'gh@nexical/nexical-starter' });

        expect(git.clone).toHaveBeenCalledWith(
            'https://github.com/nexical/nexical-starter.git',
            expect.stringContaining(targetDir),
            { recursive: true }
        );
    });

    it('should proceed if directory exists but is empty', async () => {
        vi.mocked(fs.pathExists as any).mockResolvedValue(true);
        vi.mocked(fs.readdir).mockResolvedValue([] as any);

        await command.run({ directory: 'empty-dir', repo: 'foo' });

        expect(fs.mkdir).not.toHaveBeenCalled(); // Should assume dir exists
        expect(git.clone).toHaveBeenCalledWith('foo.git', expect.stringContaining('empty-dir'), { recursive: true });
    });

    it('should fail if directory exists and is not empty', async () => {
        // First exists check for targetDir
        vi.mocked(fs.pathExists as any).mockResolvedValue(true);
        vi.mocked(fs.readdir).mockResolvedValue(['file.txt'] as any);

        await expect(command.run({ directory: 'existing-dir', repo: 'foo' }))
            .rejects.toThrow('Process.exit(1)');

        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('not empty'));
    });

    it('should handle git errors gracefully', async () => {
        vi.mocked(git.clone).mockRejectedValueOnce(new Error('Git fail'));

        await expect(command.run({ directory: 'fail-project', repo: 'foo' }))
            .rejects.toThrow('Process.exit(1)');

        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize project'));
    });
});
