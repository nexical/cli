
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class TeamsListCommand extends BaseCommand {
    static description = 'List all teams you belong to';

    async run() {
        const client = getClient();
        try {
            const teams = await client.teams.list();

            if (teams.length === 0) {
                this.info('You are not a member of any teams.');
                return;
            }

            this.info('Your Teams:');
            for (const team of teams) {
                this.info(`- ${team.name} (${team.slug}) [${team.role || 'member'}]`);
            }
        } catch (error: any) {
            this.error(`Failed to list teams: ${error.message}`);
        }
    }
}
