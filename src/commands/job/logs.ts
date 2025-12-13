
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class JobsLogsCommand extends BaseCommand {
    static description = 'Get logs for a job';

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
            const logs = await client.jobs.getLogs(tid, pid, bid, jid);

            this.info(`Logs for Job ${jid}:`);
            // Assuming logs is an array of JobLog objects
            for (const log of (logs as any)) { // Casting because SDK return type might be generic array
                const timestamp = new Date(log.timestamp).toLocaleTimeString();
                const color = log.level === 'error' ? 'red' : log.level === 'warn' ? 'yellow' : 'white';

                if (log.level === 'error') {
                    this.error(`[${timestamp}] ${log.message}`);
                } else if (log.level === 'warn') {
                    this.warn(`[${timestamp}] ${log.message}`);
                } else {
                    this.info(`[${timestamp}] ${log.message}`);
                }
            }
        } catch (error: any) {
            this.error(`Failed to get logs: ${error.message}`);
        }
    }
}
