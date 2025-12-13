
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class BranchesListCommand extends BaseCommand {
    static description = 'List branches in a project';

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
            const branches = await client.branches.list(tid, pid);

            if (branches.length === 0) {
                this.info('No branches found.');
                return;
            }

            this.info(`Branches for Project ${pid}:`);
            for (const branch of branches) {
                this.info(`- ${branch.name} (ID: ${branch.id})`);
            }
        } catch (error: any) {
            this.error(`Failed to list branches: ${error.message}`);
        }
    }
}
