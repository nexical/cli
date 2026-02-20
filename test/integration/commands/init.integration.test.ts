import { CLI } from '@nexical/cli-core';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import InitCommand from '../../../src/commands/init.js';
import { createTempDir, createMockRepo } from '../../utils/integration-helpers.js';
import path from 'node:path';
import fs from 'fs-extra';
import { execa } from 'execa';

describe('InitCommand Integration', () => {
  let tempDir: string;
  let starterRepoDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir('init-integration-');
    const starterDir = await createTempDir('starter-repo-');

    // precise setup of a starter repo
    starterRepoDir = await createMockRepo(starterDir, {
      'package.json': JSON.stringify({
        name: 'nexical-starter',
        version: '0.0.0',
        scripts: {
          setup: 'echo setup',
        },
        dependencies: {
          'is-odd': '3.0.1',
        },
      }),
      'README.md': '# Starter Template',
      'core/src/index.ts': 'console.log("core")',
      'apps/frontend/README.md': '# Frontend',
      'apps/backend/README.md': '# Backend',
    });

    // Set Git Identity for the test process so InitCommand's commit works in CI
    process.env.GIT_AUTHOR_NAME = 'Test User';
    process.env.GIT_AUTHOR_EMAIL = 'test@example.com';
    process.env.GIT_COMMITTER_NAME = 'Test User';
    process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
    // Allow file protocol for local cloning in CI
    process.env.GIT_ALLOW_PROTOCOL = 'file';
  });

  afterAll(async () => {
    // await cleanupTestRoot(); // conflicting with parallel tests
    if (tempDir) await fs.remove(tempDir);
  });

  it('should initialize a new project from a local git repo', async () => {
    const targetProjectName = 'my-new-project';
    const targetPath = path.join(tempDir, targetProjectName);
    const cli = new CLI({ commandName: 'nexical' });

    const command = new InitCommand(cli);

    // Capture stdout/stderr? InitCommand uses consola.
    // For integration, we care about the FS side effects.

    await command.run({
      directory: targetPath,
      repo: starterRepoDir, // Passing local path as repo URL
    });

    // 1. Check directory exists
    expect(fs.existsSync(targetPath)).toBe(true);

    // 2. Check files cloned
    expect(fs.existsSync(path.join(targetPath, 'package.json'))).toBe(true);
    expect(fs.existsSync(path.join(targetPath, 'README.md'))).toBe(true);

    // 3. Check git initialization
    expect(fs.existsSync(path.join(targetPath, '.git'))).toBe(true);

    // 4. Check git initialization (history should be preserved + one new commit)
    const { stdout: log } = await execa('git', ['log', '--oneline'], { cwd: targetPath });
    const lines = log.split('\n').filter(Boolean);
    expect(lines.length).toBe(2); // Should have "Initial site commit" and "Initial commit"
    expect(lines[0]).toContain('Initial site commit');
    expect(lines[1]).toContain('Initial commit');

    // 5. Check dependencies (optional, but command tries to install them)
    // Since we are mocking the repo, it doesn't have a real lockfile or valid deps,
    // so `npm install` might have failed or done nothing.
    // However, `InitCommand` runs `npm install`. If that fails, the command throws/exits.
    // We provided a minimal package.json so it should succeed.
    expect(fs.existsSync(path.join(targetPath, 'node_modules'))).toBe(true);
  }, 60000);

  it('should initialize with a custom repo', async () => {
    const targetProjectName = 'custom-repo-project';
    const targetPath = path.join(tempDir, targetProjectName);
    const cli = new CLI({ commandName: 'nexical' });
    const command = new InitCommand(cli);

    await command.run({
      directory: targetPath,
      repo: starterRepoDir, // Reusing starter repo as "custom"
    });

    expect(fs.existsSync(targetPath)).toBe(true);
    expect(fs.existsSync(path.join(targetPath, 'package.json'))).toBe(true);
  }, 60000);
});
