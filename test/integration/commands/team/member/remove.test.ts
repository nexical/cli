
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsMembersRemoveCommand from '../../../../../src/commands/team/member/remove.js';
import { getClient } from '../../../../../src/utils/nexical-client.js';

vi.mock('../../../../../src/utils/nexical-client.js');

describe('TeamsMembersRemoveCommand Integration', () => {
    let command: TeamsMembersRemoveCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                removeMember: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsMembersRemoveCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should remove member successfully', async () => {
        mockClient.teams.removeMember.mockResolvedValue({});

        await command.run({ teamId: '1', userId: 'user-1' });

        expect(mockClient.teams.removeMember).toHaveBeenCalledWith(1, 'user-1');
        expect(command.success).toHaveBeenCalledWith('User user-1 removed from team 1.');
    });

    it('should handle removal failure', async () => {
        mockClient.teams.removeMember.mockRejectedValue(new Error('User not found'));

        await command.run({ teamId: '1', userId: 'user-1' });

        expect(command.error).toHaveBeenCalledWith('Failed to remove member: User not found');
    });
});
