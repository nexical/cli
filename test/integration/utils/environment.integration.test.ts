import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { linkEnvironment } from '../../../src/utils/environment.js';

describe('Environment Integration', () => {
    let tmpDir: string;
    let projectRoot: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'nexical-test-'));
        projectRoot = path.join(tmpDir, 'project');
        await fs.ensureDir(projectRoot);
        // Ensure core exists so we can link to it
        await fs.ensureDir(path.join(projectRoot, 'src/core'));
    });

    afterEach(async () => {
        await fs.remove(tmpDir);
    });

    it('should link entire public directory', async () => {
        // Setup Starter Public 
        const publicDir = path.join(projectRoot, 'public');
        await fs.ensureDir(publicDir);
        await fs.writeFile(path.join(publicDir, 'starter.txt'), 'STARTER');

        // Run
        await linkEnvironment(projectRoot);

        // Verify
        const resultDir = path.join(projectRoot, 'site/public');
        expect(await fs.pathExists(resultDir)).toBe(true);

        // Should be symlink to Starter public dir
        const stats = await fs.lstat(resultDir);
        expect(stats.isSymbolicLink()).toBe(true);
        const target = await fs.readlink(resultDir);
        expect(target).toBe(publicDir);

        // Content check
        expect(await fs.pathExists(path.join(resultDir, 'starter.txt'))).toBe(true);
    });

    it('should link entire content directory', async () => {
        // Setup Starter Content
        const contentDir = path.join(projectRoot, 'content');
        await fs.ensureDir(contentDir);
        await fs.writeFile(path.join(contentDir, 'config.yaml'), 'starter: true');

        // Run
        await linkEnvironment(projectRoot);

        // Verify
        const resultItem = path.join(projectRoot, 'site/content');
        expect(await fs.pathExists(resultItem)).toBe(true);

        // Should be symlink to Starter content dir
        const stats = await fs.lstat(resultItem);
        expect(stats.isSymbolicLink()).toBe(true);
        const target = await fs.readlink(resultItem);
        expect(target).toBe(contentDir);

        // Content check
        expect(await fs.pathExists(path.join(resultItem, 'config.yaml'))).toBe(true);
    });

    it('should link modules directory if it exists', async () => {
        // Setup Starter Modules
        const modulesDir = path.join(projectRoot, 'src/modules');
        await fs.ensureDir(modulesDir);
        await fs.ensureDir(path.join(modulesDir, 'test-mod'));

        // Run
        await linkEnvironment(projectRoot);

        // Verify
        const resultItem = path.join(projectRoot, 'site/modules');
        expect(await fs.pathExists(resultItem)).toBe(true);

        // Should be symlink to Starter modules dir
        const stats = await fs.lstat(resultItem);
        expect(stats.isSymbolicLink()).toBe(true);
        const target = await fs.readlink(resultItem);
        expect(target).toBe(modulesDir);
    });
});
