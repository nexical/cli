
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../utils/nexical-client.js';

export default class WhoamiCommand extends BaseCommand {
    static description = 'Show current logged in user';

    async run() {
        const client = getClient();

        try {
            const user = await client.users.me();
            this.info(`Logged in as:`);
            this.info(`  Name:  ${user.fullName}`);
            this.info(`  Email: ${user.email}`);
            this.info(`  ID:    ${user.id}`);
        } catch (error: any) {
            this.error('Not logged in or token expired. Run `astrical login`.');
        }
    }
}
