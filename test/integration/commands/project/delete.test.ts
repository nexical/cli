
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsDeleteCommand from '../../../../src/commands/project/delete.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsDeleteCommand Integration', () => {
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
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should delete project successfully', async () => {
        mockClient.projects.delete.mockResolvedValue({});

        await command.run({ teamId: '1', projectId: '2', confirm: true });

        expect(mockClient.projects.delete).toHaveBeenCalledWith(1, 2);
        expect(command.success).toHaveBeenCalledWith('Project 2 deleted.');
    });

    it('should handle deletion failure', async () => {
        mockClient.projects.delete.mockRejectedValue(new Error('Project not found'));

        await command.run({ teamId: '1', projectId: '2', confirm: true });

        expect(command.error).toHaveBeenCalledWith('Failed to delete project: Project not found');
    });
});
