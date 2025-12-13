
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class ProjectsCreateCommand extends BaseCommand {
    static description = 'Create a new project';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'ID of the team',
            },
            {
                name: 'name',
                required: true,
                description: 'Name of the project',
            },
        ],
        options: [
            {
                name: '--repo <url>',
                description: 'Repository URL',
            },
            {
                name: '--prod <url>',
                description: 'Production URL',
            },
            {
                name: '--mode <mode>',
                description: 'Mode (managed, self_hosted)',
                default: 'managed',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, name, repo, prod, mode } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        try {
            const project = await client.projects.create(tid, {
                name,
                repoUrl: repo,
                productionUrl: prod,
            });

            this.success(`Project "${project.name}" set up successfully!`);
            this.info(`ID: ${project.id}`);
        } catch (error: any) {
            this.error(`Failed to create project: ${error.message}`);
        }
    }
}
