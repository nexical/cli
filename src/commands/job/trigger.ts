
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class JobsTriggerCommand extends BaseCommand {
    static description = 'Trigger a new job';

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
                name: 'type',
                required: true,
                description: 'Job type (e.g., deploy, build)',
            },
        ],
        options: [
            {
                name: '--input <json>',
                description: 'Input JSON string',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, projectId, branchId, type, input } = options;
        const tid = parseInt(teamId, 10);
        const pid = parseInt(projectId, 10);
        const bid = parseInt(branchId, 10);

        if (isNaN(tid) || isNaN(pid) || isNaN(bid)) {
            this.error('IDs must be numbers.');
            return;
        }

        let inputs = {};
        if (input) {
            try {
                inputs = JSON.parse(input);
            } catch (e) {
                this.error('Invalid JSON inputs.');
                return;
            }
        }

        try {
            const job = await client.jobs.create(tid, pid, bid, {
                type,
                inputs,
            });

            this.success(`Job ${job.id} triggered successfully!`);
            this.info(`Status: ${job.status}`);
        } catch (error: any) {
            this.error(`Failed to trigger job: ${error.message}`);
        }
    }
}
