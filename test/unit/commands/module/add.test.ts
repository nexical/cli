import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ModuleAddCommand from '../../../../src/commands/module/add.js';
import fs from 'fs-extra';
import * as cliCore from '@nexical/cli-core';
import * as gitUtils from '../../../../src/utils/git.js';
import * as urlResolver from '../../../../src/utils/url-resolver.js';

vi.mock('fs-extra');
vi.mock('@nexical/cli-core', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@nexical/cli-core')>();
  return {
    ...mod,
    runCommand: vi.fn(),
  };
});
vi.mock('../../../../src/utils/git.js');
vi.mock('../../../../src/utils/url-resolver.js');

describe('ModuleAddCommand', () => {
  let command: ModuleAddCommand;
  const projectRoot = '/mock/project/root';

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock logger
    vi.spyOn(cliCore.logger, 'debug').mockImplementation(() => {});
    vi.spyOn(cliCore.logger, 'warn').mockImplementation(() => {});
    vi.spyOn(cliCore.logger, 'info').mockImplementation(() => {});

    command = new ModuleAddCommand({} as unknown as any, { rootDir: projectRoot });
    (command as unknown as { projectRoot: string }).projectRoot = projectRoot;

    vi.spyOn(command, 'info').mockImplementation(() => {});
    vi.spyOn(command, 'success').mockImplementation(() => {});
    vi.spyOn(command, 'error').mockImplementation(() => {});
    vi.spyOn(command, 'warn').mockImplementation(() => {});

    (urlResolver.resolveGitUrl as unknown as { mockImplementation: any }).mockImplementation(
      (url: string) => url,
    );
    (fs.ensureDir as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
    (fs.remove as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
    (fs.writeFile as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
    (gitUtils.clone as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
    (gitUtils.addSubmodule as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
    (cliCore.runCommand as unknown as { mockResolvedValue: any }).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should install a backend module correctly', async () => {
    const repoUrl = 'https://github.com/org/repo.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('models.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: my-backend-module\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: repoUrl });

    expect(gitUtils.clone).toHaveBeenCalled();
    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      repoUrl,
      'apps/backend/modules/my-backend-module',
      projectRoot,
    );
  });

  it('should install a frontend module correctly', async () => {
    const repoUrl = 'https://github.com/org/ui-repo.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('ui.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: my-frontend-module\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      repoUrl,
      'apps/frontend/modules/my-frontend-module',
      projectRoot,
    );
  });

  it('should error if no url provided', async () => {
    await command.run({ url: '' });
    expect(command.error).toHaveBeenCalledWith('Please specify a repository URL.');
  });

  it('should handle module name from package.json', async () => {
    const repoUrl = 'https://github.com/org/pkg-repo.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('package.json')) return true;
      if (pStr.endsWith('models.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readJson as unknown as { mockResolvedValue: any }).mockResolvedValue({
      name: '@modules/pkg-mod',
    });
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('modules: {}');

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/backend/modules/pkg-mod',
      projectRoot,
    );
  });

  it('should fallback to git repo name if no config found', async () => {
    const repoUrl = 'https://github.com/org/fallback-mod.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('models.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('modules: {}');

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/backend/modules/fallback-mod',
      projectRoot,
    );
  });

  it('should detect frontend module via src/components', async () => {
    const repoUrl = 'https://github.com/org/comp-mod.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('src/components')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('modules: {}');

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/frontend/modules/comp-mod',
      projectRoot,
    );
  });

  it('should skip already visited modules', async () => {
    const repoUrl = 'https://github.com/org/cycle.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('staging') && pStr.endsWith('module.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml'))
        return 'name: cycle\ndependencies:\n  - https://github.com/org/cycle.git';
      return 'modules: {}';
    });

    await command.run({ url: repoUrl });

    expect(cliCore.logger.debug).toHaveBeenCalledWith(expect.stringContaining('Already visited'));
  });

  it('should handle dependency recursion', async () => {
    const rootUrl = 'https://github.com/org/root.git';
    const depUrl = 'https://github.com/org/dep.git';
    let callCount = 0;

    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('staging') && pStr.endsWith('module.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('staging') && pStr.endsWith('module.yaml')) {
        if (callCount === 0) {
          callCount++;
          return `name: root\ndependencies:\n  - ${depUrl}`;
        } else {
          return 'name: dep';
        }
      }
      return 'modules: {}';
    });

    await command.run({ url: rootUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.stringContaining('root'),
      expect.anything(),
      projectRoot,
    );
    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.stringContaining('dep'),
      expect.anything(),
      projectRoot,
    );
  });

  it('should throw error on dependency conflict', async () => {
    const repoUrl = 'https://github.com/org/conflict.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('apps/backend/modules/conflict')) return true;
      if (pStr.includes('staging') && pStr.endsWith('module.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: conflict';
      return 'modules: {}';
    });
    (gitUtils.getRemoteUrl as unknown as { mockResolvedValue: any }).mockResolvedValue(
      'https://github.com/org/other.git',
    );

    await command.run({ url: repoUrl });

    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Dependency Conflict'));
  });

  it('should handle missing nexical.yaml', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('nexical.yaml')) return false;
      if (pStr.endsWith('module.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('name: mod');

    await command.run({ url: 'https://github.com/org/mod.git' });

    expect(cliCore.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('nexical.yaml not found'),
    );
  });

  it('should handle error during run', async () => {
    (gitUtils.clone as unknown as { mockRejectedValue: any }).mockRejectedValue(
      new Error('Git fail'),
    );
    await command.run({ url: 'https://git.com/fail' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Git fail'));
  });

  it('should handle non-Error objects in catch', async () => {
    (gitUtils.clone as unknown as { mockRejectedValue: any }).mockRejectedValue('String error');
    await command.run({ url: 'https://git.com/fail' });
    expect(command.error).toHaveBeenCalledWith(expect.stringContaining('String error'));
  });

  it('should migrate modules array to object', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('models.yaml')) return true; // BACKEND
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: mod\n';
      if (pStr.includes('nexical.yaml')) return 'modules:\n  - old-mod';
      return '';
    });

    await command.run({ url: 'https://github.com/org/mod.git' });

    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('nexical.yaml'),
      expect.stringContaining('backend:\n    - old-mod\n    - mod'),
    );
  });

  it('should handle error during nexical.yaml update', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('models.yaml')) return true; // BACKEND
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: mod\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });
    (fs.writeFile as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('nexical.yaml')) throw new Error('Write fail');
    });

    await command.run({ url: 'https://github.com/org/mod.git' });
    expect(cliCore.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update nexical.yaml: Write fail'),
    );
  });

  it('should handle non-Error exception during nexical.yaml update', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.endsWith('models.yaml')) return true; // BACKEND
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: mod\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });
    (fs.writeFile as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('nexical.yaml')) throw 'String fail';
    });

    await command.run({ url: 'https://github.com/org/mod.git' });
    expect(cliCore.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Failed to update nexical.yaml: String fail'),
    );
  });

  it('should handle .yml instead of .yaml', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yml')) return true;
      if (pStr.endsWith('module.yaml')) return false;
      if (pStr.endsWith('models.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yml')) return 'name: yml-mod\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: 'https://github.com/org/yml.git' });
    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.stringContaining('yml'),
      'apps/backend/modules/yml-mod',
      projectRoot,
    );
  });

  it('should handle dependencies as object', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (
        pStr.endsWith('module.yaml') ||
        pStr.endsWith('models.yaml') ||
        pStr.includes('nexical.yaml')
      )
        return true;
      return false;
    });
    let firstCall = true;
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) {
        if (firstCall) {
          firstCall = false;
          return 'name: obj-mod\ndependencies:\n  https://github.com/org/dep.git: latest';
        }
        return 'name: dep-mod';
      }
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: 'https://github.com/org/obj.git' });
    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.stringContaining('dep'),
      'apps/backend/modules/dep-mod',
      projectRoot,
    );
  });

  it('should handle already installed module with matching remote', async () => {
    (fs.pathExists as any).mockImplementation((p: string) => true);
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return 'name: existing-mod\n';
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });
    (gitUtils.getRemoteUrl as any).mockResolvedValue('https://github.com/org/existing-mod.git');

    await command.run({ url: 'https://github.com/org/existing-mod.git' });
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('already installed'));
  });
  it('should initialize modules object if missing from config', async () => {
    (fs.pathExists as unknown as { mockResolvedValue: any }).mockResolvedValue(true);
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('key: value');

    // Mock getModuleConfig via urlResolver logic or direct fs mocks if urlResolver calls fs
    // command.installModule -> ...
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return true;
      if (p.endsWith('module.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return '';
      if (p.endsWith('module.yaml')) return 'name: new-mod\n';
      return '';
    });

    await command.run({ url: 'http://example.com/mod.git' });

    expect(fs.writeFile).toHaveBeenCalled();
    const writeCall = (fs.writeFile as any).mock.calls[0];
    expect(writeCall[1]).toContain('modules:');
    expect(writeCall[1]).toContain('backend:');
    expect(writeCall[1]).toContain('new-mod');
  });
  it('should handle module name from package.json without scope', async () => {
    const repoUrl = 'https://github.com/org/noscope-repo.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('package.json')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readJson as unknown as { mockResolvedValue: any }).mockResolvedValue({
      name: 'noscope-mod',
    });
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('modules: {}');

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/backend/modules/noscope-mod',
      projectRoot,
    );
  });

  it('should handle package.json without name', async () => {
    const repoUrl = 'https://github.com/org/noname-repo.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('package.json')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readJson as unknown as { mockResolvedValue: any }).mockResolvedValue({});
    (fs.readFile as unknown as { mockResolvedValue: any }).mockResolvedValue('modules: {}');

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/backend/modules/noname-repo',
      projectRoot,
    );
  });

  it('should skip adding if already in nexical.yaml', async () => {
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return true;
      if (p.endsWith('module.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return 'modules:\n  backend:\n    - existing';
      if (p.endsWith('module.yaml')) return 'name: existing\n';
      return '';
    });

    await command.run({ url: 'http://example.com/existing.git' });

    expect(fs.writeFile).not.toHaveBeenCalled();
  });
  it('should handle missing name in module.yaml', async () => {
    const repoUrl = 'https://github.com/org/noname-yaml.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) return true;
      if (pStr.includes('nexical.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.endsWith('module.yaml')) return 'version: 1.0.0\n'; // name missing
      if (p.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      expect.anything(),
      'apps/backend/modules/noname-yaml',
      projectRoot,
    );
  });

  it('should handle subpath in url', async () => {
    const repoUrl = 'https://github.com/org/repo.git';
    const subpath = 'my/sub';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return true;
      if (p.endsWith('module.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return 'modules: {}';
      if (p.endsWith('module.yaml')) return 'name: sub-mod\n';
      return '';
    });

    await command.run({ url: `${repoUrl}//${subpath}` });

    expect(gitUtils.clone).toHaveBeenCalledWith(repoUrl, expect.anything(), expect.anything());
    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      repoUrl,
      'apps/backend/modules/sub-mod',
      projectRoot,
    );
  });
  it('should handle url without subpath explicitly', async () => {
    const repoUrl = 'https://github.com/org/nosub.git';
    (fs.pathExists as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return true;
      if (p.endsWith('module.yaml')) return true;
      return false;
    });
    (fs.readFile as unknown as { mockImplementation: any }).mockImplementation((p: string) => {
      if (p.includes('nexical.yaml')) return 'modules: {}';
      if (p.endsWith('module.yaml')) return 'name: nosub-mod\n';
      return '';
    });

    await command.run({ url: repoUrl });

    expect(gitUtils.addSubmodule).toHaveBeenCalledWith(
      repoUrl,
      'apps/backend/modules/nosub-mod',
      projectRoot,
    );
  });
  it('should handle dependencies as an object', async () => {
    const repoUrl = 'https://github.com/org/dep-obj.git';

    // We must ensure that targetDir (apps/backend/modules/dep-obj) does NOT exist for initial call
    // and ALSO for some-dep if we want to see install logs.
    (fs.pathExists as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.includes('nexical.yaml')) return true;
      if (pStr.includes('module.yaml')) return true;
      if (pStr.includes('models.yaml') || pStr.includes('api.yaml')) return true;
      return false;
    });

    (fs.readFile as any).mockImplementation((p: string) => {
      const pStr = p.toString();
      if (pStr.endsWith('module.yaml')) {
        if (pStr.includes('staging')) {
          return 'name: dep-obj\ndependencies:\n  some-dep: "1.0.0"\n';
        }
      }
      if (pStr.includes('nexical.yaml')) return 'modules: {}';
      return '';
    });

    await command.run({ url: repoUrl });

    // Check if error was called which might explain failure
    if ((command.error as any).mock.calls.length > 0) {
      // eslint-disable-next-line no-console
      console.log('COMMAND ERROR:', (command.error as any).mock.calls[0][0]);
    }

    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Resolving 1 dependencies'));
  });

  it('should handle already installed module with matching remote', async () => {
    const repoUrl = 'https://github.com/org/match.git';
    (fs.pathExists as any).mockImplementation((p: string) => {
      if (p.includes('apps/backend/modules/match')) return true;
      return true;
    });
    (fs.readFile as any).mockImplementation((p: string) => {
      if (p.endsWith('module.yaml')) return 'name: match\n';
      return 'modules: {}';
    });
    (gitUtils.getRemoteUrl as any).mockResolvedValue('https://github.com/org/match.git');

    await command.run({ url: repoUrl });
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('already installed'));
  });

  it('should handle already installed module with empty remote', async () => {
    const repoUrl = 'https://github.com/org/empty-rem.git';
    (fs.pathExists as any).mockImplementation((p: string) => true);
    (fs.readFile as any).mockImplementation((p: string) => {
      if (p.endsWith('module.yaml')) return 'name: empty-rem\n';
      return 'modules: {}';
    });
    (gitUtils.getRemoteUrl as any).mockResolvedValue('');

    await command.run({ url: repoUrl });
    expect(command.info).toHaveBeenCalledWith(expect.stringContaining('already installed'));
  });
});
