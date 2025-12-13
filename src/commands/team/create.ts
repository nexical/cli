
import { BaseCommand } from '@nexical/cli-core';
import { getClient } from '../../utils/nexical-client.js';

export default class TeamsCreateCommand extends BaseCommand {
    static description = 'Create a new team';

    static args = {
        args: [
            {
                name: 'name',
                required: true,
                description: 'Name of the team',
            },
        ],
        options: [
            {
                name: '--slug <slug>',
                description: 'Custom URL slug for the team',
            },
        ],
    };

    async run(options: any) {
        const client = getClient();
        const { name, slug } = options;
        // Generate slug from name if not provided (simple version)
        const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

        try {
            const team = await client.teams.create({
                name,
                slug: finalSlug,
            });

            this.success(`Team "${team.name}" created successfully!`);
            this.info(`ID: ${team.id}`);
            this.info(`Slug: ${team.slug}`);
        } catch (error: any) {
            this.error(`Failed to create team: ${error.message}`);
        }
    }
}
