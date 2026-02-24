import path from 'node:path';
import { logger } from '@nexical/cli-core';
import { DeploymentProvider, DeploymentContext, CIConfig } from '../types';
import { execAsync } from '../utils';

export class RailwayProvider implements DeploymentProvider {
  name = 'railway';
  type = 'backend' as const;

  async provision(context: DeploymentContext): Promise<void> {
    const backendDir = path.join(context.cwd, 'apps/backend');
    const env = (context.options.env as string) || 'production';
    const baseProjectName = context.config.deploy?.backend?.projectName;

    if (!baseProjectName) {
      throw new Error(
        "Railway project name not found in nexical.yaml. Please configure 'deploy.backend.projectName'.",
      );
    }

    const railwayName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;

    logger.info('Configuring Railway...');

    if (context.options.dryRun) {
      logger.info(`[Dry Run] Would check Railway status and init project "${railwayName}".`);
      return;
    }

    try {
      // We consciously DO NOT pass any RAILWAY_API_TOKEN to the subprocess.
      // The user may have an invalid token in their .env file (which process.env inherits).
      // We want to force the Railway CLI to use the locally logged-in user's credentials.
      const env = { ...process.env };
      delete env.RAILWAY_API_TOKEN;
      delete env.RAILWAY_TOKEN;

      logger.info('Using local Railway CLI credentials (environment variables stripped).');

      // Check status to see if we are linked to a project
      try {
        await execAsync('railway status', { cwd: backendDir, env });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stderr = (error as { stderr?: string }).stderr || '';
        const stdout = (error as { stdout?: string }).stdout || '';
        const fullError = `${errMsg} ${stderr} ${stdout}`;

        // If status fails, likely project doesn't exist locally or we aren't linked.
        if (
          fullError.includes('Project not found') ||
          fullError.includes('No project') ||
          fullError.includes('Project is deleted')
        ) {
          if (fullError.includes('Project is deleted')) {
            logger.info('[Railway] Project is deleted. Unlinking...');
            // If it's deleted, we might need to unlink first to clean up local config
            await execAsync('railway unlink', { cwd: backendDir }).catch(() => {});
          }
          const initCmd = `railway init --name ${railwayName}`;
          logger.info(`No active Railway project linked. Initializing with: ${initCmd}`);
          await execAsync(initCmd, { cwd: backendDir, env });
        } else if (
          fullError.includes('Invalid RAILWAY_API_TOKEN') ||
          fullError.includes('Unauthorized')
        ) {
          throw new Error('Railway authentication failed during status check.');
        } else {
          // Some other error (e.g. timeout), warn and try to proceed
          logger.warn(`Railway status check failed: ${errMsg}. Proceeding.`);
        }
      }

      logger.info(`Adding PostgreSQL service if missing for "${railwayName}"...`);
      const { stdout: status } = await execAsync('railway status', { cwd: backendDir, env }).catch(
        () => ({ stdout: '' }),
      );
      if (!status.includes('postgres')) {
        try {
          await execAsync('railway add --database postgres', { cwd: backendDir, env });
        } catch {
          logger.warn('Failed to auto-add PostgreSQL.');
        }
      }
    } catch (e: unknown) {
      // Rethrow explicit auth errors, otherwise warn
      const errMsg = e instanceof Error ? e.message : String(e);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stderr = (e as any).stderr || '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stdout = (e as any).stdout || '';

      if (errMsg.includes('Railway authentication failed')) throw e;

      logger.error(`Railway setup failed with error: ${errMsg}`);
      if (stderr) logger.error(`[Railway stderr]: ${stderr}`);
      if (stdout) logger.info(`[Railway stdout]: ${stdout}`);

      logger.warn(
        'Railway setup encountered an issue. Ensure you are logged in or have a valid token.',
      );
    }
  }

  private resolveToken(context: DeploymentContext): string | undefined {
    const options = context.config.deploy?.backend?.options || {};
    const tokenEnvVar = typeof options.tokenEnvVar === 'string' ? options.tokenEnvVar : undefined;
    return (
      process.env.RAILWAY_API_TOKEN?.trim() ||
      (tokenEnvVar ? process.env[tokenEnvVar]?.trim() : undefined) ||
      process.env.RAILWAY_TOKEN?.trim()
    );
  }

  async getSecrets(context: DeploymentContext): Promise<Record<string, string>> {
    const token = this.resolveToken(context);
    const secrets: Record<string, string> = {};

    if (!token) {
      // Strict check: Error if token is missing
      throw new Error(
        `Railway Token not found. Please provide it via:\n` +
          `1. Setting RAILWAY_API_TOKEN in .env (Recommended)\n` +
          `2. Configuring 'deploy.backend.options.tokenEnvVar' in nexical.yaml\n` +
          `3. Setting RAILWAY_TOKEN in .env`,
      );
    }

    secrets['RAILWAY_API_TOKEN'] = token;
    return secrets;
  }

  async getVariables(context: DeploymentContext): Promise<Record<string, string>> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = context.config.deploy?.backend?.projectName;

    if (!baseProjectName) {
      throw new Error(
        "Railway project name not found in nexical.yaml. Please configure 'deploy.backend.projectName'.",
      );
    }

    const projectName = env === 'production' ? baseProjectName : `${baseProjectName}-${env}`;
    return {
      RAILWAY_PROJECT_NAME: projectName,
    };
  }

  getCIConfig(): CIConfig {
    return {
      secrets: ['RAILWAY_API_TOKEN'],
      variables: [],
      installSteps: ['npm install -g @railway/cli'],
      deploySteps: ['railway up --detach --project=${{ vars.RAILWAY_PROJECT_NAME }}'],
    };
  }
}
