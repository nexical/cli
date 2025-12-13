
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsGetCommand from '../../../../src/commands/team/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsGetCommand', () => {
    let command: TeamsGetCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                get: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsGetCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should get team details successfully', async () => {
        mockClient.teams.get.mockResolvedValue({
            id: '1',
            name: 'My Team',
            slug: 'my-team',
            role: 'owner'
        });

        await command.run({ teamId: '1' });

        expect(mockClient.teams.get).toHaveBeenCalledWith(1);
        expect(command.info).toHaveBeenCalledWith('Team Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:   1');
        expect(command.info).toHaveBeenCalledWith('  Name: My Team');
        expect(command.info).toHaveBeenCalledWith('  Slug: my-team');
        expect(command.info).toHaveBeenCalledWith('  Role: owner');
    });

    it('should show default role', async () => {
        mockClient.teams.get.mockResolvedValue({
            id: '1',
            name: 'My Team',
            slug: 'my-team'
        });

        await command.run({ teamId: '1' });

        expect(command.info).toHaveBeenCalledWith('  Role: member');
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
        expect(mockClient.teams.get).not.toHaveBeenCalled();
    });

    it('should handle get failure', async () => {
        mockClient.teams.get.mockRejectedValue(new Error('Team not found'));

        await command.run({ teamId: '1' });

        expect(command.error).toHaveBeenCalledWith('Failed to get team: Team not found');
    });
});
