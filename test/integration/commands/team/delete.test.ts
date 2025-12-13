
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsDeleteCommand from '../../../../src/commands/team/delete.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsDeleteCommand Integration', () => {
    let command: TeamsDeleteCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                delete: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsDeleteCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should delete team successfully', async () => {
        mockClient.teams.delete.mockResolvedValue({});

        await command.run({ teamId: '1', confirm: true });

        expect(mockClient.teams.delete).toHaveBeenCalledWith(1);
        expect(command.success).toHaveBeenCalledWith('Team 1 deleted.');
    });

    it('should handle deletion failure', async () => {
        mockClient.teams.delete.mockRejectedValue(new Error('Permission denied'));

        await command.run({ teamId: '1', confirm: true });

        expect(command.error).toHaveBeenCalledWith('Failed to delete team: Permission denied');
    });
});
