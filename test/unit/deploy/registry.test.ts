import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../../../src/deploy/registry.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '@nexical/cli-core';

vi.mock('node:fs/promises');
vi.mock('@nexical/cli-core', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock jiti for local providers
const mockJitiRequest = vi.fn();
vi.mock('jiti', () => ({
  createJiti: () => ({
    import: mockJitiRequest,
  }),
}));

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new ProviderRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getHostingProvider', () => {
    it('should return undefined for non-existent provider', () => {
      expect(registry.getHostingProvider('missing')).toBeUndefined();
    });
  });

  describe('registerProviderFromModule', () => {
    it('should register a valid deployment provider', () => {
      const MockProvider = class {
        name = 'valid-deploy';
        provision() {}
        getCIConfig() {}
      };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ default: MockProvider }, 'test');
      expect(registry.getHostingProvider('valid-deploy')).toBeDefined();
    });

    it('should register a valid repository provider', () => {
      const MockProvider = class {
        name = 'valid-repo';
        configureSecrets() {}
        generateWorkflow() {}
      };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ default: MockProvider }, 'test');
      expect(registry.getRepositoryProvider('valid-repo')).toBeDefined();
    });

    it('should handle named exports if default is missing', async () => {
      const MockProvider = class {
        name = 'named-export';
        provision() {}
        getCIConfig() {}
      };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ Named: MockProvider }, 'test');
      expect(registry.getHostingProvider('named-export')).toBeDefined();
    });

    it('should handle missing exported provider', async () => {
      const mockModule = {};
      await (
        registry as unknown as {
          registerProviderFromModule: (mod: unknown, name: string) => Promise<void>;
        }
      ).registerProviderFromModule(mockModule, 'test');
      expect(registry.getHostingProvider('test')).toBeUndefined();
    });

    it('should handle instantiation failure', async () => {
      const MockProvider = vi.fn().mockImplementation(() => {
        throw new Error('Instantiate fail');
      });
      const mockModule = { Provider: MockProvider };
      await (
        registry as unknown as {
          registerProviderFromModule: (mod: unknown, name: string) => Promise<void>;
        }
      ).registerProviderFromModule(mockModule, 'fail');
      expect(registry.getHostingProvider('fail')).toBeUndefined();
    });

    it('should handle non-class provider', async () => {
      const mockModule = { Provider: { name: 'static' } };
      await (
        registry as unknown as {
          registerProviderFromModule: (mod: unknown, name: string) => Promise<void>;
        }
      ).registerProviderFromModule(mockModule, 'static');
      expect(registry.getHostingProvider('static')).toBeUndefined();
    });

    it('should register a valid DNS provider', () => {
      const MockProvider = {
        name: 'valid-dns',
        type: 'dns' as const,
        provision: vi.fn(),
      };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ default: MockProvider }, 'test');
      expect(registry.getDnsProvider('valid-dns')).toBeDefined();
    });

    it('should handle non-function provider object', () => {
      const mockProvider = { name: 'obj-provider', provision: () => {}, getCIConfig: () => {} };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ default: mockProvider }, 'test');
      expect(registry.getHostingProvider('obj-provider')).toBeDefined();
    });

    it('should find provider in named exports loop', () => {
      const MockProvider = class {
        name = 'named-loop';
        provision() {}
        getCIConfig() {}
      };
      (
        registry as unknown as { registerProviderFromModule: (mod: unknown, name: string) => void }
      ).registerProviderFromModule({ foo: 'bar', baz: MockProvider }, 'test');
      expect(registry.getHostingProvider('named-loop')).toBeDefined();
    });
  });

  describe('loadCoreProviders', () => {
    it('should load core providers from found directory', async () => {
      // Calculate the path where registry.ts expects providers
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const dirname = path.resolve(__dirname, '../../../src/deploy/providers');
      const mockProviderPath = path.join(dirname, 'mock.js');

      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockResolvedValue(['mock.js'] as unknown as never);

      // Mock the specific file that registry will import
      vi.doMock(mockProviderPath, () => ({
        default: class MockCore {
          name = 'core-mock';
          provision() {}
          getCIConfig() {}
        },
      }));

      await registry.loadCoreProviders();

      // Assert
      expect(fs.readdir).toHaveBeenCalled();
      expect(registry.getHostingProvider('core-mock')).toBeDefined();
    });

    it('should warn if no providers directory found', async () => {
      vi.spyOn(fs, 'access').mockRejectedValue(new Error('ENOENT'));
      await registry.loadCoreProviders();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Could not locate core providers'),
      );
    });

    it('should warn if scanning providers fails', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('Scan fail'));
      await registry.loadCoreProviders();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to scan core providers'),
      );
    });

    it('should warn if loading a provider fails', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockResolvedValue(['bad.js'] as unknown as never);
      // We do NOT mock bad.js, so import() should fail
      await registry.loadCoreProviders();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load core provider'),
      );
    });

    it('should ignore non-js/ts files', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockResolvedValue(['README.md', 'type.d.ts'] as unknown as never);
      const spy = vi.spyOn(
        registry as unknown as { registerProviderFromModule: (m: unknown, s: string) => void },
        'registerProviderFromModule',
      );

      await registry.loadCoreProviders();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('loadLocalProviders', () => {
    it('should load local providers using jiti', async () => {
      const mockRoot = '/mock/root';
      const deployDir = path.join(mockRoot, 'deploy');
      vi.spyOn(fs, 'readdir').mockResolvedValue(['custom.ts'] as unknown as never);

      mockJitiRequest.mockResolvedValue({
        default: class {
          name = 'local-custom';
          provision() {}
          getCIConfig() {}
        },
      });

      await registry.loadLocalProviders(mockRoot);

      expect(mockJitiRequest).toHaveBeenCalledWith(path.join(deployDir, 'custom.ts'));
      expect(registry.getHostingProvider('local-custom')).toBeDefined();
    });

    it('should ignore non-js/ts files', async () => {
      const mockRoot = '/mock/root';
      vi.spyOn(fs, 'readdir').mockResolvedValue(['README.md', 'notes.txt'] as unknown as never);

      await registry.loadLocalProviders(mockRoot);
      expect(mockJitiRequest).not.toHaveBeenCalled();
    });

    it('should skip if directory missing', async () => {
      vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('ENOENT'));
      await registry.loadLocalProviders('/root');
      expect(mockJitiRequest).not.toHaveBeenCalled();
    });

    it('should warn if loading local provider fails', async () => {
      const mockRoot = '/mock/root';
      vi.spyOn(fs, 'readdir').mockResolvedValue(['broken.ts'] as unknown as never);
      mockJitiRequest.mockRejectedValue(new Error('Jiti fail'));

      await registry.loadLocalProviders(mockRoot);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load local provider'),
      );
    });

    it('should handle non-Error exceptions when loading local provider', async () => {
      const mockRoot = '/mock/root';
      vi.spyOn(fs, 'readdir').mockResolvedValue(['broken.ts'] as unknown as never);
      mockJitiRequest.mockRejectedValue('String fail');

      await registry.loadLocalProviders(mockRoot);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load local provider from broken.ts: String fail'),
      );
    });
  });

  describe('Core non-Error cases', () => {
    it('should handle non-Error in loadCoreProviders readdir', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockRejectedValue('Readdir string fail');
      await registry.loadCoreProviders();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Readdir string fail'));
    });

    it('should handle non-Error during registration in loadCoreProviders', async () => {
      vi.spyOn(fs, 'access').mockResolvedValue(undefined);
      vi.spyOn(fs, 'readdir').mockResolvedValue(['fail-registration.js'] as unknown as never);

      // Mock registerProviderFromModule to throw a string
      const regSpy = vi
        .spyOn(
          registry as unknown as { registerProviderFromModule: (m: unknown, s: string) => void },
          'registerProviderFromModule',
        )
        .mockImplementation(() => {
          throw 'Registration string fail';
        });

      // Mock path.join to return a known string for vi.doMock
      vi.spyOn(path, 'join').mockReturnValue('MOCK_REG_FAIL');
      vi.doMock('MOCK_REG_FAIL', () => ({ default: {} }));

      await registry.loadCoreProviders();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Registration string fail'));

      regSpy.mockRestore();
    });
  });
});
