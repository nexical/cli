import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as helpers from '../../utils/integration-helpers.js';
import fs from 'fs-extra';
import { execa } from 'execa';
import path from 'path';

vi.mock('fs-extra');
vi.mock('execa');

describe('Integration Helpers Unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runCLI should execute node with correct arguments', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(execa).mockResolvedValue({ exitCode: 0 } as any);
    const args = ['init', 'my-project'];
    const cwd = '/test/cwd';
    const env = { FOO: 'bar' };

    await helpers.runCLI(args, cwd, { env });

    expect(execa).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining([expect.stringContaining('dist/index.js'), ...args]),
      expect.objectContaining({
        cwd,
        env: expect.objectContaining({ FOO: 'bar' }),
        reject: false,
      }),
    );
  });

  it('createTempDir should create directory and return path', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);

    const dir = await helpers.createTempDir('test-prefix-');

    expect(dir).toContain('test-prefix-');
    expect(fs.ensureDir).toHaveBeenCalledWith(dir);
  });

  it('cleanupTestRoot should remove test root directory', async () => {
    vi.mocked(fs.remove).mockResolvedValue(undefined);

    await helpers.cleanupTestRoot();

    expect(fs.remove).toHaveBeenCalledWith(expect.stringContaining('.test-tmp'));
  });

  it('createMockRepo should initialize git repo and commit files', async () => {
    vi.mocked(fs.ensureDir).mockResolvedValue(undefined);
    vi.mocked(fs.outputFile).mockResolvedValue(undefined);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(execa).mockResolvedValue({} as any);

    const dir = '/test/repo';
    const files = {
      'package.json': '{}',
      'README.md': '# Test',
    };

    await helpers.createMockRepo(dir, files);

    expect(fs.ensureDir).toHaveBeenCalledWith(dir);
    expect(execa).toHaveBeenCalledWith('git', ['init'], expect.objectContaining({ cwd: dir }));
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email', 'test@test.com'],
      expect.objectContaining({ cwd: dir }),
    );
    expect(fs.outputFile).toHaveBeenCalledWith(path.join(dir, 'package.json'), '{}');
    expect(fs.outputFile).toHaveBeenCalledWith(path.join(dir, 'README.md'), '# Test');
    expect(execa).toHaveBeenCalledWith('git', ['add', '.'], expect.objectContaining({ cwd: dir }));
    expect(execa).toHaveBeenCalledWith(
      'git',
      ['commit', '-m', 'Initial commit'],
      expect.objectContaining({ cwd: dir }),
    );
  });
});
