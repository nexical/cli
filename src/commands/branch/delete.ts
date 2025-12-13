
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class BranchesDeleteCommand extends BaseCommand {
    static description = 'Delete a branch';

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
            await client.branches.delete(tid, pid, bid);
            this.success(`Branch ${bid} deleted.`);
        } catch (error: any) {
            this.error(`Failed to delete branch: ${error.message}`);
        }
    }
}
