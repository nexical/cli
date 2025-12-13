
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class AuthTokensGenerateCommand extends BaseCommand {
    static description = 'Generate a new API token';

    static args = {
        args: [
            {
                name: 'name',
                required: true,
                description: 'Name of the token',
            },
        ],
        options: [
            {
                name: '--scopes <scopes>',
                description: 'Comma-separated list of scopes',
            },
            {
                name: '--expires <isoDate>',
                description: 'Expiration date (ISO 8601)',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { name, scopes, expires } = options;

        try {
            const token = await client.auth.generateToken({
                name,
                scopes: scopes ? scopes.split(',') : undefined,
            });

            this.success(`Token "${name}" generated!`);
            this.warn(`Token: ${token.token}`);
            this.warn('Make sure to copy it now. You won\'t be able to see it again!');
        } catch (error: any) {
            this.error(`Failed to generate token: ${error.message}`);
        }
    }
}
