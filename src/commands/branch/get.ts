
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class BranchesGetCommand extends BaseCommand {
    static description = 'Get branch details';

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
            {
                name: 'branchId',
                required: true,
                description: 'Branch ID',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, branchId } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);
        const bid = parseInt(branchId, 10);

        if (isNaN(tid) || isNaN(pid) || isNaN(bid)) {
            this.error('IDs must be numbers.');
            return;
        }

        try {
            const branch = await client.branches.get(tid, pid, bid);
            this.info(`Branch Details:`);
            this.info(`  ID:   ${branch.id}`);
            this.info(`  Name: ${branch.name}`);
            this.info(`  Preview: ${branch.previewUrl || 'N/A'}`);
        } catch (error: any) {
            this.error(`Failed to get branch: ${error.message}`);
        }
    }
}
