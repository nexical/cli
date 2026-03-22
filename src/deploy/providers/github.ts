import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { logger } from '@nexical/cli-core';
import { RepositoryProvider, DeploymentContext, HostingProvider, AppConfig } from '../types';
import { execAsync } from '../utils';
import { TemplateManager } from '../template-manager';

interface GitHubStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
  [key: string]: unknown;
}

interface GitHubWorkflow {
  on:
    | string
    | {
        push?: {
          branches?: string[];
          paths?: string[];
        };
      };
  jobs: {
    deploy: {
      steps: GitHubStep[];
    };
    [key: string]: unknown;
  };
}

export class GitHubProvider implements RepositoryProvider {
  name = 'github';
  private templateManager = new TemplateManager();

  async configureSecrets(
    context: DeploymentContext,
    secrets: Record<string, string>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(secrets)) {
      if (!value) continue;
      logger.info(`Setting secret ${key} in GitHub...`);
      if (context.options.dryRun) {
        logger.info(`[Dry Run] Would set secret ${key}`);
      } else {
        await execAsync(`gh secret set ${key} --body "${value}"`);
      }
    }
  }

  async configureVariables(
    context: DeploymentContext,
    variables: Record<string, string>,
  ): Promise<void> {
    for (const [key, value] of Object.entries(variables)) {
      if (!value) continue;
      logger.info(`Setting variable ${key} in GitHub...`);
      if (context.options.dryRun) {
        logger.info(`[Dry Run] Would set variable ${key}`);
      } else {
        await execAsync(`gh variable set ${key} --body "${value}"`);
      }
    }
  }

  async generateWorkflow(
    context: DeploymentContext,
    targets: { provider: HostingProvider; app: AppConfig }[],
  ): Promise<void> {
    const workflowsDir = path.join(context.cwd, '.github/workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    for (const { provider, app } of targets) {
      const config = provider.getCIConfig('github', app);
      if (!config) continue;

      const filename = `deploy-${app.name}.yml`;
      const filepath = path.join(workflowsDir, filename);

      const workflow = (await this.templateManager.loadWorkflow('github-workflow', {
        APP_NAME: app.name,
        PROVIDER_NAME: provider.name,
      })) as GitHubWorkflow;

      // Update push trigger if paths are specified
      if (app.paths && app.paths.length > 0) {
        if (typeof workflow.on === 'string') {
          workflow.on = {
            push: { branches: [workflow.on] },
          };
        }

        const onObj = workflow.on as { push?: { branches?: string[]; paths?: string[] } };
        if (!onObj.push) {
          onObj.push = { branches: ['main'] };
        }
        onObj.push.paths = app.paths;
      }

      const steps = workflow.jobs.deploy.steps;

      // Build (if applicable)
      if (app.buildCommand) {
        const buildStep: GitHubStep = {
          name: `Build ${app.name}`,
          run: app.buildCommand,
        };

        const buildEnv: Record<string, string> = {};
        if (app.domain) {
          const domain = Array.isArray(app.domain) ? app.domain[0] : app.domain;
          buildEnv.SITE = `https://${domain}`;
        }

        if (app.env) {
          Object.assign(buildEnv, app.env);
        }

        if (Object.keys(buildEnv).length > 0) {
          buildStep.env = buildEnv;
        }

        steps.push(buildStep);
      }

      // Provider Install Steps
      if (config.installSteps) {
        for (const step of config.installSteps) {
          steps.push({
            name: `Install ${provider.name} CLI`,
            run: step,
          });
        }
      }

      // Provider Deploy Steps
      if (config.deploySteps) {
        for (const step of config.deploySteps) {
          const deployStep: GitHubStep = {
            name: `Deploy ${app.name} to ${provider.name}`,
            run: step,
            'working-directory': app.target || '.',
          };

          const allSecrets = [...(config.secrets || [])];
          if (app.secrets) {
            allSecrets.push(...Object.keys(app.secrets));
          }

          if (allSecrets.length > 0) {
            deployStep.env = allSecrets.reduce((acc: Record<string, string>, secret) => {
              acc[secret] = `\${{ secrets.${secret} }}`;
              return acc;
            }, {});
          }

          steps.push(deployStep);
        }
      }

      // Provider Action Step
      if (config.githubActionStep) {
        steps.push(config.githubActionStep as GitHubStep);
      }

      await fs.writeFile(filepath, YAML.stringify(workflow, { lineWidth: 0 }), 'utf-8');
      logger.info(`Generated workflow: ${filepath}`);
    }
  }
}
