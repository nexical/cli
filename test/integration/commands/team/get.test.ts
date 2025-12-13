
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsGetCommand from '../../../../src/commands/team/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsGetCommand Integration', () => {
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
        expect(command.info).toHaveBeenCalledWith('  Name: My Team');
        expect(command.info).toHaveBeenCalledWith('  Role: owner');
    });

    it('should handle get failure', async () => {
        mockClient.teams.get.mockRejectedValue(new Error('Not found'));

        await command.run({ teamId: '1' });

        expect(command.error).toHaveBeenCalledWith('Failed to get team: Not found');
    });
});
