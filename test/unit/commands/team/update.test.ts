
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsUpdateCommand from '../../../../src/commands/team/update.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsUpdateCommand', () => {
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
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'warn').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should update team successfully', async () => {
        mockClient.teams.update.mockResolvedValue({
            id: '1',
            name: 'New Name',
            slug: 'new-slug'
        });

        await command.run({ teamId: '1', name: 'New Name', slug: 'new-slug' });

        expect(mockClient.teams.update).toHaveBeenCalledWith(1, {
            name: 'New Name',
        });
        expect(command.success).toHaveBeenCalledWith('Team 1 updated!');
        expect(command.info).toHaveBeenCalledWith('Name: New Name');
        expect(command.info).toHaveBeenCalledWith('Slug: new-slug');
    });

    it('should warn if no updates provided', async () => {
        await command.run({ teamId: '1' });
        expect(command.warn).toHaveBeenCalledWith('No updates provided. Use --name or --slug.');
        expect(mockClient.teams.update).not.toHaveBeenCalled();
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
        expect(mockClient.teams.update).not.toHaveBeenCalled();
    });

    it('should handle update failure', async () => {
        mockClient.teams.update.mockRejectedValue(new Error('Update failed'));

        await command.run({ teamId: '1', name: 'N' });

        expect(command.error).toHaveBeenCalledWith('Failed to update team: Update failed');
    });
});
