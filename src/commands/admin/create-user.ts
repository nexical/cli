
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../../utils/nexical-client.js';

export default class AdminUsersCreateSystemCommand extends BaseCommand {
    static description = 'Create a new system user';

    static args = {
        args: [
            {
                name: 'name',
                required: true,
                description: 'System user name',
            },
            {
                name: 'email',
                required: true,
                description: 'System user email',
            },
            {
                name: 'password',
                required: true,
                description: 'System user password',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { name, email, password } = options;

        try {
            const response = await client.auth.createSystemUser({
                fullName: name,
                email,
                password,
            });
            const user = response.user;

            this.success(`System user "${user.fullName}" created!`);
            this.info(`ID: ${user.id}`);
        } catch (error: any) {
            this.error(`Failed to create system user: ${error.message}`);
        }
    }
}
