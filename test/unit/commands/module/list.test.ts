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
  it('should handle missing metadata files', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return true; // loc.path exists
      return false; // metadata files don't exist
    });
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['mod-no-meta'];
      return [];
    });
    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });

    await command.run();
    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'mod-no-meta', type: 'backend', version: 'unknown', description: '' },
    ]);
  });

  it('should support .yml extension for module config', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (
        pStr.endsWith('backend/modules') ||
        pStr.endsWith('frontend/modules') ||
        pStr.endsWith('legacy/modules')
      )
        return true;
      if (pStr.endsWith('yml-mod')) return true;
      if (pStr.endsWith('module.yml')) return true;
      if (pStr.endsWith('module.yaml')) return false;
      if (pStr.endsWith('package.json')) return false;
      return false;
    });
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['yml-mod'];
      return [];
    });
    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.endsWith('module.yml')) return 'name: YmlName\nversion: 1.2.3';
      return '';
    });

    await command.run();
    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith([
      { name: 'YmlName', type: 'backend', version: '1.2.3', description: '' },
    ]);
  });
  it('should handle both .yaml and .yml existing (favoring .yaml)', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (
        pStr.endsWith('backend/modules') ||
        pStr.endsWith('frontend/modules') ||
        pStr.endsWith('legacy/modules')
      )
        return true;
      if (pStr.endsWith('dual-mod')) return true;
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('module.yml')) return true;
      return false;
    });
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['dual-mod'];
      return [];
    });
    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.endsWith('module.yaml')) return 'name: YamlName';
      if (p.endsWith('module.yml')) return 'name: YmlName';
      return '';
    });

    await command.run();
    // eslint-disable-next-line no-console
    expect(console.table).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'YamlName' })]),
    );
  });
  it('should handle only .yaml existing', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('backend/modules')) return true;
      if (pStr.endsWith('yaml-only')) return true;
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('module.yml')) return false;
      return false;
    });
    (fs.readdir as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['yaml-only'];
      return [];
    });
    (fs.stat as unknown as { mockResolvedValue: any }).mockResolvedValue({
      isDirectory: () => true,
    });
    (fs.readFile as any).mockResolvedValue('name: YamlOnly');
    await command.run();
    expect(console.table).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'YamlOnly' })]),
    );
  });

  it('should handle both .yaml and .yml missing', async () => {
    (fs.pathExists as any).mockResolvedValue(false);
    (fs.readdir as any).mockImplementation((p: string) => {
      if (p.includes('modules')) return ['no-config'];
      return [];
    });
    (fs.stat as any).mockResolvedValue({ isDirectory: () => true });
    await command.run();
    // Should skip it and NOT call console.table since length 0
    expect(console.table).not.toHaveBeenCalled();
  });
  it('should handle all 8 permutations of metadata existence', async () => {
    const mods = [
      { id: 't-t-t', pkg: true, yaml: true, yml: true },
      { id: 't-t-f', pkg: true, yaml: true, yml: false },
      { id: 't-f-t', pkg: true, yaml: false, yml: true },
      { id: 't-f-f', pkg: true, yaml: false, yml: false },
      { id: 'f-t-t', pkg: false, yaml: true, yml: true },
      { id: 'f-t-f', pkg: false, yaml: true, yml: false },
      { id: 'f-f-t', pkg: false, yaml: false, yml: true },
      { id: 'f-f-f', pkg: false, yaml: false, yml: false },
    ];

    (fs.pathExists as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('modules')) return true;
      const mod = mods.find((m) => pStr.includes(m.id));
      if (!mod) return false;
      if (pStr.endsWith('package.json')) return mod.pkg;
      if (pStr.endsWith('module.yaml')) return mod.yaml;
      if (pStr.endsWith('module.yml')) return mod.yml;
      return true; // The directory itself
    });

    (fs.readdir as any).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return mods.map((m) => m.id);
      return [];
    });
    (fs.stat as any).mockResolvedValue({ isDirectory: () => true });

    (fs.readJson as any).mockImplementation((p: string) => {
      const mod = mods.find((m) => p.includes(m.id));
      if (mod?.pkg) return { version: `pkg-${mod.id}` };
      return {};
    });

    (fs.readFile as any).mockImplementation((p: string) => {
      const mod = mods.find((m) => p.includes(m.id));
      if (!mod) return '';
      const isYaml = p.endsWith('module.yaml');
      const name = isYaml ? `yaml-${mod.id}` : `yml-${mod.id}`;
      const version = isYaml ? `v-yaml-${mod.id}` : `v-yml-${mod.id}`;
      return `name: ${name}\nversion: ${version}`;
    });

    await command.run();

    // Verify specific precedence
    expect(console.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'yaml-t-t-t', version: 'pkg-t-t-t' }), // pkg version precedence, yaml name precedence
        expect.objectContaining({ name: 'yml-f-f-t', version: 'v-yml-f-f-t' }), // yml used if yaml/pkg missing
        expect.objectContaining({ name: 'f-f-f', version: 'unknown' }), // none
      ]),
    );
  });

  it('should cover catch blocks and falsy returns in all paths', async () => {
    (fs.pathExists as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('apps/backend/modules')) return true;
      return true; // Every candidate exists to trigger catch blocks
    });
    (fs.readdir as any).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules')) return ['fail-json', 'fail-yaml'];
      return [];
    });
    (fs.stat as any).mockResolvedValue({ isDirectory: () => true });

    (fs.readJson as any).mockImplementation((p: string) => {
      if (p.includes('fail-json')) throw new Error('json fail');
      return null;
    });
    (fs.readFile as any).mockImplementation((p: string) => {
      if (p.includes('fail-yaml')) throw new Error('yaml fail');
      return '';
    });

    await command.run();
    expect(console.table).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fail-json', version: 'unknown' }),
        expect.objectContaining({ name: 'fail-yaml', version: 'unknown' }),
      ]),
    );
  });
});
