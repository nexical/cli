
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class ProjectsListCommand extends BaseCommand {
    static description = 'List projects in a team';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'ID of the team',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        try {
            const projects = await client.projects.list(tid);

            if (projects.length === 0) {
                this.info(`No projects found in team ${tid}.`);
                return;
            }

            this.info(`Projects in Team ${tid}:`);
            for (const project of projects) {
                this.info(`- ${project.name} (ID: ${project.id}) [${project.repoUrl || 'No Repo'}]`);
            }
        } catch (error: any) {
            this.error(`Failed to list projects: ${error.message}`);
        }
    }
}
