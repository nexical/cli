
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../../utils/nexical-client.js';

export default class TeamsInviteCommand extends BaseCommand {
    static description = 'Invite a user to a team';

    static args = {
        args: [
            {
                name: 'teamId',
                required: true,
                description: 'ID of the team',
            },
            {
                name: 'email',
                required: true,
                description: 'Email of the user to invite',
            },
        ],
        options: [
            {
                name: '--role <role>',
                description: 'Role for the new member (admin, member)',
                default: 'member',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, email, role } = options;

        try {
            // teamId from args is string, but SDK expects number usually?
            // Docs say: Team { id: number; ... }
            // SDK methods: inviteMember(id, data)
            // BaseCommand options are typically strings from CLI args.
            // I should parse teamId to number.
            const tid = parseInt(teamId, 10);
            if (isNaN(tid)) {
                this.error('Team ID must be a number.');
                return;
            }

            await client.teams.inviteMember(tid, {
                email,
                role: role as any, // Cast to expected enum if needed
            });

            this.success(`Invited ${email} to team ${tid} as ${role}.`);
        } catch (error: any) {
            this.error(`Failed to invite member: ${error.message}`);
        }
    }
}
