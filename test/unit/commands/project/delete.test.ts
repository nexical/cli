
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsDeleteCommand from '../../../../src/commands/project/delete.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsDeleteCommand', () => {
    let command: ProjectsDeleteCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            projects: {
                delete: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new ProjectsDeleteCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        // Mock prompt method which is likely on BaseCommand prototype or instance
        (command as any).prompt = vi.fn();
    });

    it('should delete project successfully with confirmation', async () => {
        mockClient.projects.delete.mockResolvedValue({});
        (command as any).prompt.mockResolvedValue('yes');

        await command.run({ teamId: '1', projectId: '2', confirm: false });

        expect((command as any).prompt).toHaveBeenCalled();
        expect(mockClient.projects.delete).toHaveBeenCalledWith(1, 2);
        expect(command.success).toHaveBeenCalledWith('Project 2 deleted.');
    });

    it('should delete project successfully with --confirm flag', async () => {
        mockClient.projects.delete.mockResolvedValue({});

        await command.run({ teamId: '1', projectId: '2', confirm: true });

        expect((command as any).prompt).not.toHaveBeenCalled();
        expect(mockClient.projects.delete).toHaveBeenCalledWith(1, 2);
        expect(command.success).toHaveBeenCalledWith('Project 2 deleted.');
    });

    it('should abort deletion if user says no', async () => {
        (command as any).prompt.mockResolvedValue('no');

        await command.run({ teamId: '1', projectId: '2', confirm: false });

        expect(mockClient.projects.delete).not.toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Aborted.');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '2' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
    });

    it('should handle deletion failure', async () => {
        mockClient.projects.delete.mockRejectedValue(new Error('Project not found'));

        await command.run({ teamId: '1', projectId: '2', confirm: true });

        expect(command.error).toHaveBeenCalledWith('Failed to delete project: Project not found');
    });
});
