
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class TeamsUpdateCommand extends BaseCommand {
    static description = 'Update team details';

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
                name: '--name <name>',
                description: 'New name',
            },
            {
                name: '--slug <slug>',
                description: 'New slug',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { teamId, name, slug } = options;
        const tid = parseInt(teamId, 10);

        if (isNaN(tid)) {
            this.error('Team ID must be a number.');
            return;
        }

        if (!name && !slug) {
            this.warn('No updates provided. Use --name or --slug.');
            return;
        }

        try {
            const team = await client.teams.update(tid, {
                name,
            });
            this.success(`Team ${team.id} updated!`);
            this.info(`Name: ${team.name}`);
            this.info(`Slug: ${team.slug}`);
        } catch (error: any) {
            this.error(`Failed to update team: ${error.message}`);
        }
    }
}
