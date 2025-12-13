
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class BranchesCreateCommand extends BaseCommand {
    static description = 'Create a new branch';

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
                name: 'name',
                required: true,
                description: 'Name of the branch',
            },
        ],
        options: [
            {
                name: '--preview <url>',
                description: 'Preview URL',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, name, preview } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);

        if (isNaN(tid) || isNaN(pid)) {
            this.error('IDs must be numbers.');
            return;
        }

        try {
            const branch = await client.branches.create(tid, pid, {
                name,
                previewUrl: preview,
            });

            this.success(`Branch "${branch.name}" created!`);
            this.info(`ID: ${branch.id}`);
        } catch (error: any) {
            this.error(`Failed to create branch: ${error.message}`);
        }
    }
}
