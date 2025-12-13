
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsMembersRemoveCommand from '../../../../../src/commands/team/member/remove.js';
import { getClient } from '../../../../../src/utils/nexical-client.js';

vi.mock('../../../../../src/utils/nexical-client.js');

describe('TeamsMembersRemoveCommand', () => {
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

        await command.run({ teamId: '1', userId: 'user-123' });

        expect(mockClient.teams.removeMember).toHaveBeenCalledWith(1, 'user-123');
        expect(command.success).toHaveBeenCalledWith('User user-123 removed from team 1.');
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid', userId: 'user-123' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
        expect(mockClient.teams.removeMember).not.toHaveBeenCalled();
    });

    it('should handle removal failure', async () => {
        mockClient.teams.removeMember.mockRejectedValue(new Error('User not found'));

        await command.run({ teamId: '1', userId: 'user-123' });

        expect(command.error).toHaveBeenCalledWith('Failed to remove member: User not found');
    });
});
