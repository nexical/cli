import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@nexical/cli-core';
import { HostingProvider, RepositoryProvider, DnsProvider } from './types';

export class ProviderRegistry {
  private hostingProviders: Map<string, HostingProvider> = new Map();
  private repositoryProviders: Map<string, RepositoryProvider> = new Map();
  private dnsProviders: Map<string, DnsProvider> = new Map();

  registerHostingProvider(provider: HostingProvider) {
    this.hostingProviders.set(provider.name, provider);
  }

  registerRepositoryProvider(provider: RepositoryProvider) {
    this.repositoryProviders.set(provider.name, provider);
  }

  getHostingProvider(name: string): HostingProvider | undefined {
    return this.hostingProviders.get(name);
  }

  getRepositoryProvider(name: string): RepositoryProvider | undefined {
    return this.repositoryProviders.get(name);
  }

  registerDnsProvider(provider: DnsProvider) {
    this.dnsProviders.set(provider.name, provider);
  }

  getDnsProvider(name: string): DnsProvider | undefined {
    return this.dnsProviders.get(name);
  }

  private registerProviderFromModule(module: unknown, source: string) {
    const exports = module as Record<string, unknown>;
    let ProviderCandidate = exports?.default;

    // Handle named exports if default is missing (fallback)
    if (!ProviderCandidate && exports && Object.keys(exports).length > 0) {
      // Try to find a class export that looks like a provider
      for (const key of Object.keys(exports)) {
        if (typeof exports[key] === 'function') {
          ProviderCandidate = exports[key];
          break;
        }
      }
    }

    if (!ProviderCandidate) return;

    let instance: unknown;
    if (typeof ProviderCandidate === 'function') {
      try {
        instance = new (ProviderCandidate as new () => unknown)();
      } catch {
        // Not a constructor or failed, could be a regular function
        instance = ProviderCandidate;
      }
    } else {
      instance = ProviderCandidate;
    }

    if (!instance || typeof instance !== 'object') return;

    const provider = instance as Record<string, unknown>;

    if (typeof provider.provision === 'function' && typeof provider.getCIConfig === 'function') {
      const p = provider as unknown as HostingProvider;
      logger.info(`[Registry] Loaded ${source} hosting provider: ${p.name}`);
      this.registerHostingProvider(p);
    } else if (
      typeof provider.configureSecrets === 'function' &&
      typeof provider.generateWorkflow === 'function'
    ) {
      const p = provider as unknown as RepositoryProvider;
      logger.info(`[Registry] Loaded ${source} repository provider: ${p.name}`);
      this.registerRepositoryProvider(p);
    } else if (typeof provider.provision === 'function' && provider.type === 'dns') {
      const p = provider as unknown as DnsProvider;
      logger.info(`[Registry] Loaded ${source} DNS provider: ${p.name}`);
      this.registerDnsProvider(p);
    }
  }

  async loadCoreProviders() {
    const dirname = path.dirname(new URL(import.meta.url).pathname);

    // Try multiple paths to find the providers directory
    // 1. 'providers' - Standard source structure / flattened dist
    // 2. 'src/deploy/providers' - tsup output (chunk in root, files in src/...)
    const candidates = [
      path.join(dirname, 'providers'),
      path.join(dirname, 'src/deploy/providers'),
    ];

    let providersDir = '';
    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        providersDir = candidate;
        break;
      } catch {
        // Ignore missing dir
      }
    }

    if (!providersDir) {
      logger.warn(
        `[Registry] Could not locate core providers directory. Checked: ${candidates.join(', ')}`,
      );
      return;
    }

    try {
      const files = await fs.readdir(providersDir);
      for (const file of files) {
        if (file.endsWith('.js') || (file.endsWith('.ts') && !file.endsWith('.d.ts'))) {
          try {
            const providerPath = path.join(providersDir, file);
            const module = await import(providerPath);
            this.registerProviderFromModule(module, 'core');
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.warn(`Failed to load core provider from ${file}: ${message}`);
          }
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(`Failed to scan core providers at ${providersDir}: ${message}`);
    }
  }

  async loadLocalProviders(cwd: string) {
    const deployDir = path.join(cwd, 'deploy');
    try {
      const files = await fs.readdir(deployDir);
      for (const file of files) {
        if (file.endsWith('.ts') || file.endsWith('.js')) {
          try {
            const providerPath = path.join(deployDir, file);
            // Use jiti to load TS/JS files dynamically
            const jiti = (await import('jiti')).createJiti(import.meta.url);
            const module = (await jiti.import(providerPath)) as unknown;
            this.registerProviderFromModule(module, 'local');
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            logger.warn(`Failed to load local provider from ${file}: ${message}`);
          }
        }
      }
    } catch {
      // Ignore if deploy dir doesn't exist
    }
  }
}
