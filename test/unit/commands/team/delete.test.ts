
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamsDeleteCommand from '../../../../src/commands/team/delete.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('TeamsDeleteCommand', () => {
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
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        (command as any).prompt = vi.fn();
    });

    it('should delete team successfully with confirmation', async () => {
        mockClient.teams.delete.mockResolvedValue({});
        (command as any).prompt.mockResolvedValue('yes');

        await command.run({ teamId: '1', confirm: false });

        expect((command as any).prompt).toHaveBeenCalled();
        expect(mockClient.teams.delete).toHaveBeenCalledWith(1);
        expect(command.success).toHaveBeenCalledWith('Team 1 deleted.');
    });

    it('should delete team successfully with --confirm flag', async () => {
        mockClient.teams.delete.mockResolvedValue({});

        await command.run({ teamId: '1', confirm: true });

        expect((command as any).prompt).not.toHaveBeenCalled();
        expect(mockClient.teams.delete).toHaveBeenCalledWith(1);
        expect(command.success).toHaveBeenCalledWith('Team 1 deleted.');
    });

    it('should abort deletion if user says no', async () => {
        (command as any).prompt.mockResolvedValue('no');

        await command.run({ teamId: '1', confirm: false });

        expect(mockClient.teams.delete).not.toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Aborted.');
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
    });

    it('should handle deletion failure', async () => {
        mockClient.teams.delete.mockRejectedValue(new Error('Team not found'));

        await command.run({ teamId: '1', confirm: true });

        expect(command.error).toHaveBeenCalledWith('Failed to delete team: Team not found');
    });
});
