import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@nexical/cli-core';
import { DeploymentProvider, RepositoryProvider } from './types';

export class ProviderRegistry {
  private deploymentProviders: Map<string, DeploymentProvider> = new Map();
  private repositoryProviders: Map<string, RepositoryProvider> = new Map();

  registerDeploymentProvider(provider: DeploymentProvider) {
    this.deploymentProviders.set(provider.name, provider);
  }

  registerRepositoryProvider(provider: RepositoryProvider) {
    this.repositoryProviders.set(provider.name, provider);
  }

  getDeploymentProvider(name: string): DeploymentProvider | undefined {
    return this.deploymentProviders.get(name);
  }

  getRepositoryProvider(name: string): RepositoryProvider | undefined {
    return this.repositoryProviders.get(name);
  }

  private registerProviderFromModule(module: unknown, source: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moduleAny = module as any;
    let provider = moduleAny.default;

    // Handle named exports if default is missing (fallback)
    if (!provider && Object.keys(moduleAny).length > 0) {
      // Try to find a class export that looks like a provider
      for (const key of Object.keys(moduleAny)) {
        if (typeof moduleAny[key] === 'function') {
          provider = moduleAny[key];
          break;
        }
      }
    }

    // If it's a class, instantiate it
    if (typeof provider === 'function') {
      try {
        provider = new provider();
      } catch {
        // Not a constructor or failed
      }
    }

    if (provider) {
      if (typeof provider.provision === 'function' && typeof provider.getCIConfig === 'function') {
        logger.info(`[Registry] Loaded ${source} deployment provider: ${provider.name}`);
        this.registerDeploymentProvider(provider as DeploymentProvider);
      } else if (
        typeof provider.configureSecrets === 'function' &&
        typeof provider.generateWorkflow === 'function'
      ) {
        logger.info(`[Registry] Loaded ${source} repository provider: ${provider.name}`);
        this.registerRepositoryProvider(provider as RepositoryProvider);
      }
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
