import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { logger } from '@nexical/cli-core';
import { RepositoryProvider, DeploymentContext, DeploymentProvider } from '../types';
import { execAsync } from '../utils';

export class GitHubProvider implements RepositoryProvider {
  name = 'github';

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

  async generateWorkflow(context: DeploymentContext, targets: DeploymentProvider[]): Promise<void> {
    const workflowsDir = path.join(context.cwd, '.github/workflows');
    await fs.mkdir(workflowsDir, { recursive: true });

    for (const target of targets) {
      const config = target.getCIConfig('github');
      if (!config) continue;

      const filename = `deploy-${target.type}.yml`;
      const filepath = path.join(workflowsDir, filename);

      const workflow: Record<string, unknown> = {
        name: `Deploy ${target.type === 'backend' ? 'Backend' : 'Frontend'} to ${target.name}`,
        on: {
          push: { branches: ['main'] },
          workflow_dispatch: {},
        },
        jobs: {
          deploy: {
            'runs-on': 'ubuntu-latest',
            permissions: {
              contents: 'read',
              deployments: 'write',
            },
            steps: [
              {
                name: 'Checkout',
                uses: 'actions/checkout@v4',
                with: { submodules: 'recursive' },
              },
              {
                name: 'Setup Node',
                uses: 'actions/setup-node@v4',
                with: { 'node-version': 20, cache: 'npm' },
              },
              {
                name: 'Install Dependencies',
                run: 'npm ci',
              },
            ],
          },
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const steps = (workflow as any).jobs.deploy.steps;

      // Build (if frontend)
      if (target.type === 'frontend') {
        steps.push({
          name: 'Build Frontend',
          run: 'npm run build --workspace=@app/frontend',
        });
      }

      // Provider Install Steps
      if (config.installSteps) {
        for (const step of config.installSteps) {
          steps.push({
            name: `Install ${target.name} CLI`,
            run: step,
          });
        }
      }

      // Provider Deploy Steps
      if (config.deploySteps) {
        for (const step of config.deploySteps) {
          const deployStep: Record<string, unknown> = {
            name: `Deploy to ${target.name}`,
            run: step,
            'working-directory': target.type === 'backend' ? 'apps/backend' : 'apps/frontend',
          };

          if (config.secrets && config.secrets.length > 0) {
            deployStep.env = config.secrets.reduce((acc: Record<string, string>, secret) => {
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

      await fs.writeFile(filepath, YAML.stringify(workflow), 'utf-8');
      logger.info(`Generated workflow: ${filepath}`);
    }
  }
}
