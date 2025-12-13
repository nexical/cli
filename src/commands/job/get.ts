
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class JobsGetCommand extends BaseCommand {
    static description = 'Get job details';

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
            {
                name: 'jobId',
                required: true,
                description: 'Job ID',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, branchId, jobId } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);
        const bid = parseInt(branchId, 10);
        const jid = parseInt(jobId, 10);

        if (isNaN(tid) || isNaN(pid) || isNaN(bid) || isNaN(jid)) {
            this.error('IDs must be numbers.');
            return;
        }

        try {
            const job = await client.jobs.get(tid, pid, bid, jid);
            this.info(`Job Details:`);
            this.info(`  ID:      ${job.id}`);
            this.info(`  Type:    ${job.type}`);
            this.info(`  Status:  ${job.status}`);
            this.info(`  Started: ${job.startedAt || 'Waiting'}`);
            this.info(`  Ended:   ${job.completedAt || 'Running'}`);
            this.info(`  Queue:   ${job.queue}`);
        } catch (error: any) {
            this.error(`Failed to get job: ${error.message}`);
        }
    }
}
