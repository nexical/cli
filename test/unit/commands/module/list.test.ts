import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModuleListCommand from '../../../../src/commands/module/list.js';
import fs from 'fs-extra';

vi.mock('fs-extra');

describe('ModuleListCommand', () => {
  let command: ModuleListCommand;
  const projectRoot = '/mock/project';

  beforeEach(() => {
    vi.resetAllMocks();
    command = new ModuleListCommand({} as any, { rootDir: projectRoot });
    (command as any).projectRoot = projectRoot;
    vi.spyOn(console, 'table').mockImplementation(() => {});
    vi.spyOn(command, 'info').mockImplementation(() => {});

    // Default mocks for info gathering
    (fs.readJson as unknown as { mockResolvedValue: any }).mockResolvedValue({});
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('');
    (fs.pathExists as unknown as { mockResolvedValue: any }).mockResolvedValue(false);
    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });
  });

  it('should list modules from both backend and frontend', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation(
      (p: string) => true,
    );
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('backend')) return ['mod-b'];
      if (p.includes('frontend')) return ['mod-f'];
      return [];
    });

    await command.run();

    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'mod-b', type: 'backend', version: 'unknown', description: '' },
      { name: 'mod-f', type: 'frontend', version: 'unknown', description: '' },
    ]);
  });

  it('should handle empty module directories', async () => {
    (fs.pathExists as unknown as { mockReturnValue: any }).mockReturnValue(true);
    (fs.readdir as unknown as { mockResolvedValue: any }).mockResolvedValue([]);

    await command.run();
    expect(command.info).toHaveBeenCalledWith('No modules installed.');
  });

  it('should sort modules by name', async () => {
    (fs.pathExists as unknown as { mockReturnValue: any }).mockReturnValue(true);
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('backend')) return ['z-mod', 'a-mod'];
      return [];
    });

    await command.run();

    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'a-mod', type: 'backend', version: 'unknown', description: '' },
      { name: 'z-mod', type: 'backend', version: 'unknown', description: '' },
    ]);
  });

  it('should handle missing directories', async () => {
    (fs.pathExists as any).mockReturnValue(false);
    await command.run();
    expect(command.info).toHaveBeenCalledWith('No modules installed.');
  });

  it('should handle one directory missing and one empty', async () => {
    (fs.pathExists as any).mockImplementation((p: string) => p.includes('backend'));
    (fs.readdir as unknown as { mockResolvedValue: any }).mockResolvedValue([]);
    await command.run();
    expect(command.info).toHaveBeenCalledWith('No modules installed.');
  });

  it('should handle backend empty and frontend not empty', async () => {
    (fs.pathExists as unknown as { mockReturnValue: any }).mockReturnValue(true);
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('backend')) return [];
      if (p.includes('frontend')) return ['front-mod'];
      return [];
    });
    await command.run();
    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'front-mod', type: 'frontend', version: 'unknown', description: '' },
    ]);
  });

  it('should handle non-directory entries', async () => {
    (fs.pathExists as unknown as { mockReturnValue: any }).mockReturnValue(true);
    (fs.readdir as any).mockResolvedValue(['file.txt']);
    (fs.stat as any).mockResolvedValue({ isDirectory: () => false });

    await command.run();
    expect(command.info).toHaveBeenCalledWith('No modules installed.');
  });

  it('should handle empty config and package.json', async () => {
    (fs.pathExists as unknown as { mockReturnValue: any }).mockReturnValue(true);

    // Config files exist check returns true, but readJson/readFile fail or return null
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation(
      (p: string) => true,
    );

    // Only return module for backend path to avoid duplicates in test output
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['mod-a'];
      return [];
    });

    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });
    (fs.readJson as any).mockResolvedValue(null);
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue(''); // Empty string -> YAML.parse returns null/undefined

    await command.run();

    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'mod-a', type: 'backend', version: 'unknown', description: '' },
    ]);
  });
});
