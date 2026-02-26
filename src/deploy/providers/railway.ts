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

interface RailwayProject {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface RailwayServiceNode {
  id: string;
  name: string;
  [key: string]: unknown;
}

interface RailwayStatusJson {
  id?: string;
  services?: {
    edges?: { node: RailwayServiceNode }[];
  };
  [key: string]: unknown;
}

interface CommandError {
  stderr?: string;
  stdout?: string;
  message?: string;
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
      const token = this.resolveToken(context, app);
      if (token) {
        processEnv.RAILWAY_API_TOKEN = token;
        logger.info('Using Railway API Token from environment.');
      } else {
        logger.warn('No Railway API Token found. Falling back to local CLI credentials.');
      }

      // 1. Check if the project already exists to avoid speculative linking errors
      logger.info(`[Railway] Checking for existing project "${projectName}"...`);
      let projects: RailwayProject[] = [];
      try {
        const listData = await execAsync('railway list --json', {
          cwd: targetDir,
          env: processEnv,
        });
        projects = JSON.parse((listData as { stdout: string }).stdout || '[]') as RailwayProject[];
      } catch (listError: unknown) {
        const listStderr = (listError as CommandError).stderr || '';
        if (listStderr.toLowerCase().includes('unauthorized')) {
          throw new Error(
            'Railway authentication failed while listing projects. Please check your RAILWAY_API_TOKEN.',
          );
        }
        logger.warn(
          `Failed to list Railway projects: ${listError instanceof Error ? listError.message : String(listError)}. Proceeding with fallback.`,
        );
      }

      const targetProject = projects.find(
        (p) => p.name?.toLowerCase() === projectName.toLowerCase(),
      );

      if (targetProject) {
        logger.info(
          `[Railway] Found existing project "${projectName}" (${targetProject.id}). Linking...`,
        );
        const environment = (context.options.env as string) || 'production';
        await execAsync(
          `railway link --project ${targetProject.id} --environment "${environment}"`,
          {
            cwd: targetDir,
            env: processEnv,
          },
        );
      } else {
        try {
          // If not found in list, we still try status as a fallback in case the token is project-scoped
          await execAsync('railway status', { cwd: targetDir, env: processEnv });
          logger.info(`[Railway] Directory already linked to project "${projectName}".`);
        } catch (statusError: unknown) {
          const statusOutput =
            `${(statusError as CommandError).stderr || ''} ${(statusError as CommandError).stdout || ''}`.toLowerCase();
          if (
            statusOutput.includes('not linked') ||
            statusOutput.includes('no linked project') ||
            statusOutput.includes('project not found')
          ) {
            logger.info(`[Railway] Project "${projectName}" not found. Initializing...`);
            await execAsync(`railway init --name ${projectName}`, {
              cwd: targetDir,
              env: processEnv,
            });
          } else {
            throw statusError;
          }
        }
      }

      const rwConfig = (app.railway as RailwayConfig) || {};
      const services = rwConfig.services || [];

      // Re-check status once to see what's already there
      const getStatusData = async (): Promise<RailwayStatusJson> => {
        const statusData = await execAsync('railway status --json', {
          cwd: targetDir,
          env: processEnv,
        }).catch(() => ({ stdout: '{}' }));
        try {
          return JSON.parse((statusData as { stdout: string }).stdout || '{}') as RailwayStatusJson;
        } catch {
          return {};
        }
      };

      let statusJson = await getStatusData();
      const getServices = (json: RailwayStatusJson): RailwayServiceNode[] => {
        return json.services?.edges?.map((edge) => edge.node) ?? [];
      };

      // 1. Ensure the main application service exists and is LINKED
      const appName = app.name;
      let existingServices = getServices(statusJson);
      let mainService = existingServices.find(
        (s) => s.name?.toLowerCase() === appName.toLowerCase(),
      );

      if (!mainService) {
        logger.info(`Adding application service "${appName}" to project "${projectName}"...`);
        try {
          await execAsync(`railway add --service ${appName}`, {
            cwd: targetDir,
            env: processEnv,
          });
          statusJson = await getStatusData();
          existingServices = getServices(statusJson);
          mainService = existingServices.find(
            (s) => s.name?.toLowerCase() === appName.toLowerCase(),
          );
        } catch (err: unknown) {
          logger.warn(
            `Failed to auto-add application service "${appName}": ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const serviceId = mainService?.id || appName;

      // Always link explicitly by ID to be safe
      logger.info(`Linking directory to service "${appName}" (${serviceId})...`);
      await execAsync(`railway service link ${serviceId}`, {
        cwd: targetDir,
        env: processEnv,
      }).catch((err) => {
        logger.warn(
          `Failed to link service ${serviceId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });

      // 2. Set Build/Start commands if provided
      if (app.buildCommand) {
        logger.info(`Setting RAILPACK_BUILD_CMD for service ${appName}...`);
        await execAsync(
          `railway variable set --service ${serviceId} RAILPACK_BUILD_CMD="${app.buildCommand}"`,
          {
            cwd: targetDir,
            env: processEnv,
          },
        ).catch((err) => {
          logger.warn(
            `Failed to set RAILPACK_BUILD_CMD: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      const startCommand = app.startCommand || (app.options?.startCommand as string);
      if (startCommand) {
        logger.info(`Setting RAILPACK_START_CMD for service ${appName}...`);
        await execAsync(
          `railway variable set --service ${serviceId} RAILPACK_START_CMD="${startCommand}"`,
          {
            cwd: targetDir,
            env: processEnv,
          },
        ).catch((err) => {
          logger.warn(
            `Failed to set RAILPACK_START_CMD: ${err instanceof Error ? err.message : String(err)}`,
          );
        });
      }

      if (services.length > 0) {
        logger.info(
          `Provisioning ${services.length} additional services for project "${projectName}"...`,
        );

        for (const service of services) {
          const currentServices = getServices(statusJson);
          if (service.type === 'database') {
            const dbName = service.name;
            const exists = currentServices.some(
              (s) => s.name?.toLowerCase() === dbName.toLowerCase(),
            );

            if (!exists) {
              logger.info(`Adding ${dbName} database service to project "${projectName}"...`);
              try {
                await execAsync(`railway add --database ${dbName}`, {
                  cwd: targetDir,
                  env: processEnv,
                });
                statusJson = await getStatusData();
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

      // Handle Linked Domains (Provisioning phase)
      if (app.domain) {
        const environment = (context.options.env as string) || 'production';
        await this.ensureDomainsLinked(context, app, {
          targetDir,
          processEnv,
          phase: 'provision',
          serviceId,
          environment,
        });
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      const stderr = (e as CommandError).stderr || '';
      const stdout = (e as CommandError).stdout || '';

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
      (tokenEnvVar ? process.env[tokenEnvVar]?.trim() : undefined)
    );
  }

  async deploy(context: DeploymentContext, app: AppConfig): Promise<void> {
    const appDir = app.target ? path.resolve(context.cwd, app.target) : context.cwd;
    const environment = (context.options.env as string) || 'production';

    logger.info(`Deploying ${app.name} to Railway...`);

    const token = this.resolveToken(context, app);
    const processEnv = { ...process.env };
    if (token) {
      processEnv.RAILWAY_API_TOKEN = token;
    }

    // Fetch project and service IDs from the application's linked directory
    const statusData = await execAsync('railway status --json', {
      cwd: appDir,
      env: processEnv,
    }).catch(() => ({ stdout: '{}' }));
    const statusJson = JSON.parse(
      (statusData as { stdout: string }).stdout || '{}',
    ) as RailwayStatusJson;
    const projectId = statusJson.id;
    const existingServices: RailwayServiceNode[] =
      statusJson.services?.edges?.map((edge) => edge.node) ?? [];
    const mainService = existingServices.find(
      (s) => s.name?.toLowerCase() === app.name.toLowerCase(),
    );
    const serviceId = mainService?.id || app.name;

    if (!projectId) {
      throw new Error(
        `No linked Railway project found in ${appDir}. Please run 'nexical deploy' without '--manual' first or ensure the project is provisioned.`,
      );
    }

    const deployCmd = `railway up --detach --project ${projectId} --service ${serviceId} --environment "${environment}"`;

    if (context.options.dryRun) {
      logger.info(`[Dry Run] Would run: ${deployCmd}`);
      logger.info(`[Dry Run] Execution directory: ${context.cwd}`);
      return;
    }
    await execAsync(deployCmd, {
      cwd: context.cwd, // Execute from root to provide monorepo context
      env: processEnv,
    });

    // Ensure domains are linked after deployment (Execution phase)
    if (app.domain) {
      await this.ensureDomainsLinked(context, app, {
        targetDir: appDir,
        processEnv,
        phase: 'deploy',
        serviceId,
        environment,
      });
    }

    logger.success(`Successfully deployed ${app.name} to Railway.`);
  }

  private async ensureDomainsLinked(
    context: DeploymentContext,
    app: AppConfig,
    options: {
      targetDir: string;
      processEnv: NodeJS.ProcessEnv;
      phase: 'provision' | 'deploy';
      serviceId: string;
      environment: string;
    },
  ): Promise<void> {
    const { targetDir, processEnv, phase, serviceId, environment } = options;
    const domains = Array.isArray(app.domain) ? app.domain : [app.domain!];

    if (phase === 'provision') {
      logger.info(`Checking domains for Railway service "${app.name}" (${serviceId})...`);
    } else {
      logger.info(
        `Linking ${domains.length} domains to Railway service "${app.name}" (${serviceId}) in environment "${environment}"...`,
      );
    }

    for (const domain of domains) {
      if (context.options.dryRun) {
        logger.info(`[Dry Run] Would link domain ${domain} to service "${serviceId}".`);
        continue;
      }

      let attempts = 0;
      const maxAttempts = 5;
      let linked = false;

      while (attempts < maxAttempts && !linked) {
        attempts++;
        try {
          const linkCmd = `railway domain --service ${serviceId} ${domain}`;
          if (phase === 'deploy' && attempts === 1) {
            logger.info(`[Railway] Linking domain: ${linkCmd}`);
          }
          await execAsync(linkCmd, { cwd: targetDir, env: processEnv });
          linked = true;
        } catch (err: unknown) {
          const error = err as { stderr?: string };
          const stderr = error.stderr || '';
          const fullError = stderr.toLowerCase();

          if (fullError.includes('already exists') || fullError.includes('already_exists')) {
            if (phase === 'deploy' && attempts === 1) {
              logger.info(`[Railway] Domain ${domain} already linked.`);
            }
            linked = true;
          } else if (
            fullError.includes('serviceinstance not found') ||
            fullError.includes('not found')
          ) {
            if (phase === 'provision') {
              logger.warn(
                `[Railway] Service "${app.name}" not found yet. Domain linking for ${domain} will be deferred until deployment.`,
              );
              break; // Don't retry during provision, defer to deploy phase
            } else if (attempts < maxAttempts) {
              const delay = attempts * 3000;
              logger.warn(
                `[Railway] Service instance not found for ${domain}. Retrying mapping in ${delay / 1000}s... (Attempt ${attempts}/${maxAttempts})`,
              );
              await new Promise((r) => setTimeout(r, delay));
            } else {
              logger.error(
                `[Railway] Failed to link domain ${domain}: Service "${app.name}" still not found after ${maxAttempts} attempts.`,
              );
            }
          } else {
            logger.warn(
              `Failed to link domain ${domain}: ${err instanceof Error ? err.message : String(err)}`,
            );
            break; // Other errors don't trigger retry
          }
        }
      }
    }
  }

  async getSecrets(context: DeploymentContext, app: AppConfig): Promise<Record<string, string>> {
    const token = this.resolveToken(context, app);
    const secrets: Record<string, string> = {};

    if (!token) {
      throw new Error(
        `Railway Token not found for ${app.name}. Please provide it via:\n` +
          `1. Setting RAILWAY_API_TOKEN in .env (Recommended)\n` +
          `2. Configuring 'railway.token' and setting that env var in .env\n`,
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
