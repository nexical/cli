import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { logger } from '@nexical/cli-core';
import { RepositoryProvider, DeploymentContext, HostingProvider, AppConfig } from '../types';
import { execAsync } from '../utils';
import { TemplateManager } from '../template-manager';

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

      const workflow = await this.templateManager.loadWorkflow('github-workflow', {
        APP_NAME: app.name,
        PROVIDER_NAME: provider.name,
      });

      // Update push trigger if paths are specified
      if (app.paths && app.paths.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const workflowAny = workflow as any;
        if (typeof workflowAny.on === 'string') {
          workflowAny.on = {
            push: { branches: [workflowAny.on] },
          };
        }
        if (!workflowAny.on.push) {
          workflowAny.on.push = { branches: ['main'] };
        }
        workflowAny.on.push.paths = app.paths;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const steps = (workflow as any).jobs.deploy.steps;

      // Build (if applicable)
      if (app.buildCommand) {
        const buildStep: any = {
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
          const deployStep: Record<string, unknown> = {
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
        steps.push(config.githubActionStep);
      }

      await fs.writeFile(filepath, YAML.stringify(workflow, { lineWidth: 0 }), 'utf-8');
      logger.info(`Generated workflow: ${filepath}`);
    }
  }
}
