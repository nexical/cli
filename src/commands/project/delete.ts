
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class ProjectsDeleteCommand extends BaseCommand {
    static description = 'Delete a project';

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
                name: '--confirm',
                description: 'Skip confirmation',
                default: false,
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, confirm } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);

        if (isNaN(tid) || isNaN(pid)) {
            this.error('IDs must be numbers.');
            return;
        }

        if (!confirm) {
            const answer = await this.prompt(`Are you sure you want to delete project ${pid}? (yes/no)`);
            if (answer.toLowerCase() !== 'yes') {
                this.info('Aborted.');
                return;
            }
        }

        try {
            await client.projects.delete(tid, pid);
            this.success(`Project ${pid} deleted.`);
        } catch (error: any) {
            this.error(`Failed to delete project: ${error.message}`);
        }
    }
}
