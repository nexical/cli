
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class AuthTokensRevokeCommand extends BaseCommand {
    static description = 'Revoke an API token';

    static args = {
        args: [
            {
                name: 'id',
                required: true,
                description: 'ID of the token to revoke',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { id } = options;
        const tid = parseInt(id, 10);

        if (isNaN(tid)) {
            this.error('Token ID must be a number.');
            return;
        }

        try {
            await client.auth.revokeToken(tid);
            this.success(`Token ${tid} revoked.`);
        } catch (error: any) {
            this.error(`Failed to revoke token: ${error.message}`);
        }
    }
}
