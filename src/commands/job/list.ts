
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class JobsListCommand extends BaseCommand {
    static description = 'List jobs for a branch';

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
            const jobs = await client.jobs.list(tid, pid, bid);

            if (jobs.length === 0) {
                this.info('No jobs found.');
                return;
            }

            this.info(`Jobs for Branch ${bid}:`);
            for (const job of jobs) {
                this.info(`${job.id} - ${job.type} [${job.status}] (Started: ${job.startedAt || 'Waiting'})`);
            }
        } catch (error: any) {
            this.error(`Failed to list jobs: ${error.message}`);
        }
    }
}
