
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../../utils/nexical-client.js';

export default class TeamsMembersRemoveCommand extends BaseCommand {
    static description = 'Remove a member from a team';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'Team ID',
            },
            {
                name: 'userId',
                required: true,
                description: 'User ID (UUID)',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, userId } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        try {
            await client.teams.removeMember(tid, userId);
            this.success(`User ${userId} removed from team ${tid}.`);
        } catch (error: any) {
            this.error(`Failed to remove member: ${error.message}`);
        }
    }
}
