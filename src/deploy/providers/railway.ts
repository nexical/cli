import path from 'node:path';
import { logger } from '@nexical/cli-core';
import { DeploymentProvider, DeploymentContext, CIConfig } from '../types';
import { execAsync } from '../utils';

export class RailwayProvider implements DeploymentProvider {
  name = 'railway';
  type = 'backend' as const;

  async provision(context: DeploymentContext): Promise<void> {
    const backendDir = path.join(context.cwd, 'apps/backend');
    // Resolve project name/token
    const railwayName = context.config.deploy?.backend?.projectName;

    if (!railwayName) {
      throw new Error(
        "Railway project name not found in nexical.yaml. Please configure 'deploy.backend.projectName'.",
      );
    }

    // Service name defaults to project name for the primary backend
    const serviceName = railwayName || 'nexical-backend';
    // Note: Token is usually handled by `railway login` for CLI, but for CI we need it.
    // The provider might not need to know the token for `provision` if we rely on CLI auth.
    // However, we might need to export it for GitHub secrets.

    logger.info('Configuring Railway...');

    if (context.options.dryRun) {
      logger.info('[Dry Run] Would check Railway status and init project.');
      return;
    }

    try {
      try {
        await execAsync('railway status', { cwd: backendDir });
      } catch {
        const initCmd = railwayName ? `railway init --name ${railwayName}` : 'railway init';
        logger.info(`No Railway project detected in apps/backend. Initializing with: ${initCmd}`);
        await execAsync(initCmd, { cwd: backendDir });
      }

      logger.info(`Adding PostgreSQL service if missing for "${serviceName}"...`);
      const { stdout: status } = await execAsync('railway status', { cwd: backendDir });
      if (!status.includes('postgres')) {
        await execAsync('railway add --database postgres', { cwd: backendDir });
      }
    } catch (e: unknown) {
      logger.warn(
        'Railway setup encountered an issue. Ensure you are logged in with `railway login`.',
      );
      throw e;
    }
  }

  async getSecrets(context: DeploymentContext): Promise<Record<string, string>> {
    const options = context.config.deploy?.backend?.options || {};
    const secrets: Record<string, string> = {};

    // Resolve Railway Token
    // Priority: Configured Env Var > Default Env Var
    const tokenEnvVar = typeof options.tokenEnvVar === 'string' ? options.tokenEnvVar : undefined;
    const token = (tokenEnvVar ? process.env[tokenEnvVar] : undefined) || process.env.RAILWAY_TOKEN;

    if (!token) {
      // Strict check: Error if token is missing
      throw new Error(
        `Railway Token not found. Please provide it via:\n` +
          `1. Configuring 'deploy.backend.options.tokenEnvVar' in nexical.yaml and setting that env var in .env\n` +
          `2. Setting RAILWAY_TOKEN in .env`,
      );
    }

    secrets['RAILWAY_TOKEN'] = token;
    return secrets;
  }

  async getVariables(context: DeploymentContext): Promise<Record<string, string>> {
    const railwayName = context.config.deploy?.backend?.projectName;

    if (!railwayName) {
      throw new Error(
        "Railway project name not found in nexical.yaml. Please configure 'deploy.backend.projectName'.",
      );
    }

    // Service name defaults to project name
    const serviceName = railwayName || 'nexical-backend';

    return {
      RAILWAY_SERVICE_NAME: serviceName,
    };
  }

  getCIConfig(): CIConfig {
    return {
      secrets: ['RAILWAY_TOKEN'],
      variables: ['RAILWAY_SERVICE_NAME'],
      installSteps: ['npm install -g @railway/cli'],
      deploySteps: ['railway up --service ${{ vars.RAILWAY_SERVICE_NAME }} --detach'],
    };
  }
}
