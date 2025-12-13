
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class TeamsDeleteCommand extends BaseCommand {
    static description = 'Delete a team';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'Team ID',
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
        const { teamId, confirm } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        if (!confirm) {
            const answer = await this.prompt(`Are you sure you want to delete team ${tid}? (yes/no)`);
            if (answer.toLowerCase() !== 'yes') {
                this.info('Aborted.');
                return;
            }
        }

        try {
            await client.teams.delete(tid);
            this.success(`Team ${tid} deleted.`);
        } catch (error: any) {
            this.error(`Failed to delete team: ${error.message}`);
        }
    }
}
