
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsListCommand from '../../../../src/commands/team/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsListCommand Integration', () => {
    let command: TeamsListCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                list: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsListCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should list teams successfully', async () => {
        mockClient.teams.list.mockResolvedValue([
            { name: 'Team A', slug: 'team-a', role: 'admin' },
            { name: 'Team B', slug: 'team-b' }
        ]);

        await command.run();

        expect(mockClient.teams.list).toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Your Teams:');
        expect(command.info).toHaveBeenCalledWith('- Team A (team-a) [admin]');
    });

    it('should handle list failure', async () => {
        mockClient.teams.list.mockRejectedValue(new Error('Network error'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Failed to list teams: Network error');
    });
});
