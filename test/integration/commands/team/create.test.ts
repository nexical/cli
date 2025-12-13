
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsCreateCommand from '../../../../src/commands/team/create.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsCreateCommand Integration', () => {
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
            name: 'New Team',
            id: 'team-1',
            slug: 'new-team'
        });

        await command.run({ name: 'New Team', slug: 'new-team' });

        expect(mockClient.teams.create).toHaveBeenCalledWith({
            name: 'New Team',
            slug: 'new-team'
        });
        expect(command.success).toHaveBeenCalledWith('Team "New Team" created successfully!');
        expect(command.info).toHaveBeenCalledWith('ID: team-1');
        expect(command.info).toHaveBeenCalledWith('Slug: new-team');
    });

    it('should handle creation failure', async () => {
        mockClient.teams.create.mockRejectedValue(new Error('Slug taken'));

        await command.run({ name: 'New Team', slug: 'team' });

        expect(command.error).toHaveBeenCalledWith('Failed to create team: Slug taken');
    });
});
