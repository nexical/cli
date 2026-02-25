import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { NexicalConfig } from './types';
import { DeploymentSchema } from './schema';
import { logger } from '@nexical/cli-core';

export class ConfigManager {
  private configPath: string;

  constructor(cwd: string) {
    this.configPath = path.join(cwd, 'nexical.yaml');
  }

  async load(): Promise<NexicalConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const parsed = YAML.parse(content);

      const result = DeploymentSchema.safeParse(parsed);
      if (!result.success) {
        logger.error('Invalid nexical.yaml configuration:');
        result.error.issues.forEach((err) => {
          logger.error(`  - ${err.path.join('.')}: ${err.message}`);
        });
        throw new Error('Configuration validation failed.');
      }

      return result.data as NexicalConfig;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: unknown }).code === 'ENOENT'
      ) {
        return {};
      }
      throw error;
    }
  }

  async save(config: NexicalConfig): Promise<void> {
    const content = YAML.stringify(config);
    await fs.writeFile(this.configPath, content, 'utf-8');
  }

  exists(): Promise<boolean> {
    return fs
      .access(this.configPath)
      .then(() => true)
      .catch(() => false);
  }
}
