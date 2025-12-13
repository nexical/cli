
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsCreateCommand from '../../../../src/commands/team/create.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsCreateCommand', () => {
    let command: TeamsCreateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                create: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsCreateCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should create team successfully', async () => {
        mockClient.teams.create.mockResolvedValue({
            name: 'My Team',
            id: '1',
            slug: 'my-team'
        });

        await command.run({ name: 'My Team' });

        expect(mockClient.teams.create).toHaveBeenCalledWith({
            name: 'My Team',
            slug: 'my-team' // derived slug
        });
        expect(command.success).toHaveBeenCalledWith('Team "My Team" created successfully!');
        expect(command.info).toHaveBeenCalledWith('ID: 1');
        expect(command.info).toHaveBeenCalledWith('Slug: my-team');
    });

    it('should create team with custom slug', async () => {
        mockClient.teams.create.mockResolvedValue({
            name: 'My Team',
            id: '1',
            slug: 'custom-slug'
        });

        await command.run({ name: 'My Team', slug: 'custom-slug' });

        expect(mockClient.teams.create).toHaveBeenCalledWith({
            name: 'My Team',
            slug: 'custom-slug'
        });
    });

    it('should handle creation failure', async () => {
        mockClient.teams.create.mockRejectedValue(new Error('Slug taken'));

        await command.run({ name: 'My Team' });

        expect(command.error).toHaveBeenCalledWith('Failed to create team: Slug taken');
    });
});
