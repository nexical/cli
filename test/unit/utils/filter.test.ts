import { describe, it, expect } from 'vitest';
import { filterCommandDirectories } from '../../../src/utils/filter.js';
import path from 'node:path';

describe('filterCommandDirectories', () => {
  const coreDir = path.resolve('/test/packages/cli/src/commands');

  it('should filter out the core commands directory itself', () => {
    const dirs = [coreDir, path.resolve('/test/other')];
    const filtered = filterCommandDirectories(dirs, coreDir);
    expect(filtered).toEqual([path.resolve('/test/other')]);
  });

  it('should filter out default core suffixes', () => {
    const dirs = [
      path.join('/some/path', '@nexical', 'cli', 'dist', 'src', 'commands'),
      path.join('/another/path', 'packages', 'cli', 'dist', 'src', 'commands'),
      path.join('/yet/another', 'packages', 'cli', 'src', 'commands'),
      path.resolve('/test/valid'),
    ];
    const filtered = filterCommandDirectories(dirs, coreDir);
    expect(filtered).toEqual([path.resolve('/test/valid')]);
  });

  it('should handle dist/src mismatch and filter src version', () => {
    const base = '/another/project';
    const distCore = path.join(base, 'dist', 'src', 'commands');
    const srcCore = path.join(base, 'src', 'commands');

    const dirs = [srcCore, path.resolve('/test/other')];
    const filtered = filterCommandDirectories(dirs, distCore);
    expect(filtered).toEqual([path.resolve('/test/other')]);
  });

  it('should not filter out non-matching directories', () => {
    const dirs = [path.resolve('/test/modules/mod1/src/commands')];
    const filtered = filterCommandDirectories(dirs, coreDir);
    expect(filtered).toEqual(dirs);
  });
});
