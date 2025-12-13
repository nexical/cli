
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsUpdateCommand from '../../../../src/commands/team/update.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsUpdateCommand Integration', () => {
    let command: TeamsUpdateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            teams: {
                update: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new TeamsUpdateCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        vi.spyOn(command, 'warn').mockImplementation(() => { });
    });

    it('should update team successfully', async () => {
        mockClient.teams.update.mockResolvedValue({
            id: '1',
            name: 'New Name'
        });

        await command.run({ teamId: '1', name: 'New Name' });

        expect(mockClient.teams.update).toHaveBeenCalledWith(1, {
            name: 'New Name'
        });
        expect(command.success).toHaveBeenCalledWith('Team 1 updated!');
    });

    it('should handle update failure', async () => {
        mockClient.teams.update.mockRejectedValue(new Error('Update failed'));

        await command.run({ teamId: '1', name: 'New Name' });

        expect(command.error).toHaveBeenCalledWith('Failed to update team: Update failed');
    });
});
