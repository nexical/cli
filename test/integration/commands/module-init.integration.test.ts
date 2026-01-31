import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import ModuleInitCommand from '../../../src/commands/module/init.js';
import { createTempDir, createMockRepo } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';

describe('Module Init Command Integration', () => {
    let tempDir: string;
    let starterRepoDir: string;
    let projectRoot: string;

    beforeEach(async () => {
        tempDir = await createTempDir('module-init-test-');
        const starterDir = await createTempDir('starter-module-');

        // Create a mock starter repo
        starterRepoDir = await createMockRepo(starterDir, {
            'package.json': JSON.stringify({
                name: '{module_name}',
                version: '0.0.0',
            }),
            'module.yaml': 'name: {module_name}\ntype: component',
            'README.md': '# {module_name} Module'
        });

        // Setup a mock project root
        projectRoot = path.join(tempDir, 'my-project');
        await fs.ensureDir(projectRoot);
        // We need src/modules dir too, but command should create it.

        // Git configuration for the test environment
        process.env.GIT_AUTHOR_NAME = 'Test User';
        process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
        process.env.GIT_COMMITTER_NAME = 'Test User';
        process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
        process.env.GIT_ALLOW_PROTOCOL = 'file';
    });

    afterAll(async () => {
        if (tempDir) await fs.remove(tempDir);
    });

    it('should initialize a new module from a local git repo', async () => {
        const moduleName = 'my-feature';
        const cli = new CLI({ commandName: 'nexical' });
        // Manually set project root context for the command
        // Since we are invoking the command class directly we might need to mock or set the projectRoot property if BaseCommand exposes it.
        // BaseCommand usually detects project root.
        // Let's rely on BaseCommand detecting it, but we need to run it inside the projectRoot.
        // The integration-helper `TestCommand` might be useful if it existed, but here we instantiate directly.

        // We must change cwd to projectRoot for BaseCommand to pick it up?
        // Or we can manually assign it if accessible.
        // Let's try changing cwd.
        const originalCwd = process.cwd();
        process.chdir(projectRoot);

        try {
            const command = new ModuleInitCommand(cli);
            // Manually set project root for the test instance
            (command as any).projectRoot = projectRoot;

            await fs.writeJson(path.join(projectRoot, 'package.json'), { name: 'my-project' });

            await command.run({
                module_name: moduleName,
                repo: starterRepoDir
            });

            const targetPath = path.join(projectRoot, 'src', 'modules', moduleName);

            // 1. Check directory exists
            expect(fs.existsSync(targetPath)).toBe(true);

            // 2. Check files cloned and tokens replaced
            const pkgJson = await fs.readJson(path.join(targetPath, 'package.json'));
            expect(pkgJson.name).toBe(moduleName);

            const moduleYaml = await fs.readFile(path.join(targetPath, 'module.yaml'), 'utf8');
            expect(moduleYaml).toContain(`name: ${moduleName}`);

            const readme = await fs.readFile(path.join(targetPath, 'README.md'), 'utf8');
            expect(readme).toContain(`# ${moduleName} Module`);

            // 3. Check git initialization
            expect(fs.existsSync(path.join(targetPath, '.git'))).toBe(true);

            // 4. Check clean history
            const { stdout: log } = await execa('git', ['log', '--oneline'], { cwd: targetPath });
            const lines = log.split('\n').filter(Boolean);
            expect(lines.length).toBe(1);
            expect(lines[0]).toContain('Initial commit');

        } finally {
            process.chdir(originalCwd);
        }
    }, 60000);

    it('should fail if module directory already exists and is not empty', async () => {
        const moduleName = 'existing-module';
        const targetPath = path.join(projectRoot, 'src', 'modules', moduleName);
        await fs.ensureDir(targetPath);
        await fs.writeFile(path.join(targetPath, 'file.txt'), 'content');

        const cli = new CLI({ commandName: 'nexical' });
        const command = new ModuleInitCommand(cli);
        (command as any).projectRoot = projectRoot;

        // Mocking exit to prevent process exit
        const exitSpy = ((process as any).exit = (code?: number) => { throw new Error(`Process exit ${code}`) });
        const errorSpy = ((command as any).error = (msg: string) => { throw new Error(msg) }); // Catch command.error

        const originalCwd = process.cwd();
        process.chdir(projectRoot);
        await fs.writeJson(path.join(projectRoot, 'package.json'), { name: 'my-project' });

        try {
            await expect(command.run({
                module_name: moduleName,
                repo: starterRepoDir
            })).rejects.toThrow(); // Expect it to throw either from exit or error
        } finally {
            process.chdir(originalCwd);
        }
    });
});
