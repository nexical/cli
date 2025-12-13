
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class ProjectsUpdateCommand extends BaseCommand {
    static description = 'Update project details';

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
        options: [
            {
                name: '--name <name>',
                description: 'New name',
            },
            {
                name: '--repo <url>',
                description: 'New repo URL',
            },
            {
                name: '--prod <url>',
                description: 'New production URL',
            },
            {
                name: '--mode <mode>',
                description: 'New mode',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, name, repo, prod, mode } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);

        if (isNaN(tid) || isNaN(pid)) {
            this.error('IDs must be numbers.');
            return;
        }

        try {
            const project = await client.projects.update(tid, pid, {
                name,
                repoUrl: repo,
                productionUrl: prod,
            });
            this.success(`Project ${project.id} updated!`);
        } catch (error: any) {
            this.error(`Failed to update project: ${error.message}`);
        }
    }
}
