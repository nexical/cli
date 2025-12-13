
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class TeamsGetCommand extends BaseCommand {
    static description = 'Get team details';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'Team ID',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        try {
            const team = await client.teams.get(tid);
            this.info(`Team Details:`);
            this.info(`  ID:   ${team.id}`);
            this.info(`  Name: ${team.name}`);
            this.info(`  Slug: ${team.slug}`);
            this.info(`  Role: ${team.role || 'member'}`);
        } catch (error: any) {
            this.error(`Failed to get team: ${error.message}`);
        }
    }
}
