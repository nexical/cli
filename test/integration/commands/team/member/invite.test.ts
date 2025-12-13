
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsInviteCommand from '../../../../../src/commands/team/member/invite.js';
import { getClient } from '../../../../../src/utils/nexical-client.js';

vi.mock('../../../../../src/utils/nexical-client.js');

describe('TeamsInviteCommand Integration', () => {
    let command: TeamsInviteCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                inviteMember: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsInviteCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should invite member successfully', async () => {
        mockClient.teams.inviteMember.mockResolvedValue({});

        await command.run({ teamId: '1', email: 'test@example.com', role: 'member' });

        expect(mockClient.teams.inviteMember).toHaveBeenCalledWith(1, {
            email: 'test@example.com',
            role: 'member'
        });
        expect(command.success).toHaveBeenCalledWith('Invited test@example.com to team 1 as member.');
    });

    it('should handle invite failure', async () => {
        mockClient.teams.inviteMember.mockRejectedValue(new Error('Invalid email'));

        await command.run({ teamId: '1', email: 'invalid' });

        expect(command.error).toHaveBeenCalledWith('Failed to invite member: Invalid email');
    });
});
