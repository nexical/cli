
import { BaseCommand } from '@nexical/cli-core';
import { getClient, saveToken } from '../utils/nexical-client.js';

export default class LoginCommand extends BaseCommand {
    static description = 'Authenticate with Nexical via Device Flow';

    async run() {
        const client = getClient();

        this.info('Starting device authentication...');

        try {
            const token = await client.auth.authenticateDevice('nexical-cli', (userCode, verificationUri) => {
                this.notice(`Please visit: ${verificationUri}`);
                this.notice(`And enter code: ${userCode}`);

                // Optionally, we could try to open the browser here
                // import open from 'open'; open(verificationUri);
            });

            saveToken(token);
            client.setToken(token);

            const user = await client.users.me();
            this.success(`Successfully logged in as ${user.fullName} (${user.email})`);
        } catch (error: any) {
            this.error(`Login failed: ${error.message}`);
        }
    }
}
