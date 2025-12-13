
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class AuthTokensListCommand extends BaseCommand {
    static description = 'List your API tokens';

    async run() {
        const client = getClient();
        try {
            const response = await client.auth.listTokens();
            const tokens = response.tokens;

            if (tokens.length === 0) {
                this.info('No API tokens found.');
                return;
            }

            this.info('Your API Tokens:');
            for (const token of tokens) {
                this.info(`- ${token.name} (${token.tokenPrefix}...) [Expires: ${token.expiresAt || 'Never'}]`);
            }
        } catch (error: any) {
            this.error(`Failed to list tokens: ${error.message}`);
        }
    }
}
