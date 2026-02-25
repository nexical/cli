import path from 'node:path';
import { logger } from '@nexical/cli-core';
import { HostingProvider, DeploymentContext, CIConfig, AppConfig } from '../types';
import { execAsync } from '../utils';

export interface RailwayConfig {
  token?: string;
  services?: {
    type: string;
    name: string;
    [key: string]: unknown;
  }[];
}

export class RailwayProvider implements HostingProvider {
  name = 'railway';

  async provision(context: DeploymentContext, app: AppConfig): Promise<void> {
    const targetDir = app.target ? path.resolve(context.cwd, app.target) : context.cwd;
    const baseProjectName = app.projectName;

    if (!baseProjectName) {
      throw new Error(
        `Railway project name not found for ${app.name}. Please configure 'projectName'.`,
      );
    }

    const projectName = baseProjectName;

    logger.info(`Configuring Railway project "${projectName}" for ${app.name}...`);

    if (context.options.dryRun) {
      logger.info(`[Dry Run] Would check Railway status and init project "${projectName}".`);
      return;
    }

    try {
      const processEnv = { ...process.env };
      delete processEnv.RAILWAY_API_TOKEN;
      delete processEnv.RAILWAY_TOKEN;

      logger.info('Using local Railway CLI credentials (environment variables stripped).');

      try {
        await execAsync('railway status', { cwd: targetDir, env: processEnv });
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        const stderr = (error as { stderr?: string }).stderr || '';
        const stdout = (error as { stdout?: string }).stdout || '';
        const fullError = `${errMsg} ${stderr} ${stdout}`;

        if (
          fullError.includes('Project not found') ||
          fullError.includes('No project') ||
          fullError.includes('Project is deleted')
        ) {
          if (fullError.includes('Project is deleted')) {
            logger.info('[Railway] Project is deleted. Unlinking...');
            await execAsync('railway unlink', { cwd: targetDir }).catch(() => {});
          }
          const initCmd = `railway init --name ${projectName}`;
          logger.info(`No active Railway project linked. Initializing with: ${initCmd}`);
          await execAsync(initCmd, { cwd: targetDir, env: processEnv });
        } else if (
          fullError.includes('Invalid RAILWAY_API_TOKEN') ||
          fullError.includes('Unauthorized')
        ) {
          throw new Error('Railway authentication failed during status check.');
        } else {
          logger.warn(`Railway status check failed: ${errMsg}. Proceeding.`);
        }
      }

      const rwConfig = (app.railway as RailwayConfig) || {};
      const services = rwConfig.services || [];
      if (services.length > 0) {
        logger.info(`Provisioning ${services.length} services for project "${projectName}"...`);

        // Re-check status once to see what's already there
        const statusData = await execAsync('railway status', {
          cwd: targetDir,
          env: processEnv,
        }).catch(() => ({ stdout: '' }));
        const status = (statusData as { stdout: string }).stdout || '';

        for (const service of services) {
          if (service.type === 'database') {
            const dbName = service.name;
            if (!status.toLowerCase().includes(dbName.toLowerCase())) {
              logger.info(`Adding ${dbName} service to project "${projectName}"...`);
              try {
                await execAsync(`railway add --database ${dbName}`, {
                  cwd: targetDir,
                  env: processEnv,
                });
              } catch (err: unknown) {
                logger.warn(
                  `Failed to auto-add ${dbName} database: ${err instanceof Error ? err.message : String(err)}`,
                );
              }
            } else {
              logger.info(`Service ${dbName} already present in project "${projectName}".`);
            }
          } else {
            logger.warn(
              `Service type "${service.type}" is not yet supported for automatic provisioning.`,
            );
          }
        }
      }
    } catch (e: unknown) {
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

  private resolveToken(context: DeploymentContext, app: AppConfig): string | undefined {
    const rwConfig = (app.railway as RailwayConfig) || {};
    const tokenEnvVar = rwConfig.token;
    return (
      process.env.RAILWAY_API_TOKEN?.trim() ||
      (tokenEnvVar ? process.env[tokenEnvVar]?.trim() : undefined) ||
      process.env.RAILWAY_TOKEN?.trim()
    );
  }

  async deploy(context: DeploymentContext, app: AppConfig): Promise<void> {
    const targetDir = app.target ? path.resolve(context.cwd, app.target) : context.cwd;

    logger.info(`Deploying ${app.name} to Railway...`);

    if (context.options.dryRun) {
      logger.info(`[Dry Run] Would run "railway up" in ${targetDir}.`);
      return;
    }

    const token = this.resolveToken(context, app);
    const processEnv = { ...process.env };
    if (token) {
      processEnv.RAILWAY_TOKEN = token;
    }

    await execAsync('railway up --detach', {
      cwd: targetDir,
      env: processEnv,
    });

    logger.success(`Successfully deployed ${app.name} to Railway.`);
  }

  async getSecrets(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>> {
    const token = this.resolveToken(context, app);
    const secrets: Record<string, string> = {};

    if (!token) {
      throw new Error(
        `Railway Token not found for ${app.name}. Please provide it via:\n` +
          `1. Setting RAILWAY_API_TOKEN in .env (Recommended)\n` +
          `2. Configuring 'railway.token' and setting that env var in .env\n` +
          `3. Setting RAILWAY_TOKEN in .env`,
      );
    }

    secrets['RAILWAY_API_TOKEN'] = token;

    // Custom mapped secrets
    if (app.secrets) {
      for (const [key, envVar] of Object.entries(app.secrets)) {
        const value = process.env[envVar];
        if (!value) {
          throw new Error(`Custom secret '${key}' mapping failed: Env var '${envVar}' not found.`);
        }
        secrets[key] = value;
      }
    }

    return secrets;
  }

  async getVariables(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>> {
    const env = (context.options.env as string) || 'production';
    const baseProjectName = app.projectName;

    if (!baseProjectName) {
      throw new Error(`Railway project name not found for ${app.name}.`);
    }

    const result: Record<string, string> = {
      RAILWAY_PROJECT_NAME: baseProjectName,
      RAILWAY_ENVIRONMENT: env,
    };

    // Custom mapped variables
    if (app.env) {
      for (const [key, value] of Object.entries(app.env)) {
        const resolvedValue = process.env[value] || value;
        result[key] = resolvedValue;
      }
    }

    return result;
  }

  getCIConfig(repoType: 'github' | 'gitlab', app: AppConfig): CIConfig {
    return {
      secrets: ['RAILWAY_API_TOKEN'],
      variables: ['RAILWAY_ENVIRONMENT'],
      installSteps: ['npm install -g @railway/cli'],
      deploySteps: [
        `railway up --detach --project=\${{ vars.RAILWAY_PROJECT_NAME }} --environment=\${{ vars.RAILWAY_ENVIRONMENT }}`,
      ],
    };
  }

  getDefaultDnsTarget(app: AppConfig): string | undefined {
    // Railway typically creates a [project-name]-[environment].up.railway.app domain.
    // For simpler custom domain linking, users often just CNAME directly to up.railway.app
    // or the specific assigned railway generated domain if it's predictable.
    // For automatic resolution without runtime polling, returning the predictable project CNAME.
    if (app.projectName) {
      return `${app.projectName}.up.railway.app`;
    }
    return undefined;
  }
}
