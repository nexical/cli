
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class ProjectsGetCommand extends BaseCommand {
    static description = 'Get project details';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'Team ID',
            },
            {
                name: 'projectId',
                required: true,
                description: 'Project ID',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);

        if (isNaN(tid) || isNaN(pid)) {
            this.error('IDs must be numbers.');
            return;
        }

        try {
            const project = await client.projects.get(tid, pid);
            this.info(`Project Details:`);
            this.info(`  ID:   ${project.id}`);
            this.info(`  Name: ${project.name}`);
            this.info(`  Repo: ${project.repoUrl || 'N/A'}`);
            this.info(`  Prod: ${project.productionUrl || 'N/A'}`);
            this.info(`  Mode: ${project.mode}`);
        } catch (error: any) {
            this.error(`Failed to get project: ${error.message}`);
        }
    }
}
