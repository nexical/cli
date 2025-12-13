
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsUpdateCommand from '../../../../src/commands/project/update.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsUpdateCommand Integration', () => {
    let command: ProjectsUpdateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            projects: {
                update: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new ProjectsUpdateCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
        vi.spyOn(command, 'warn').mockImplementation(() => { });
    });

    it('should update project successfully', async () => {
        mockClient.projects.update.mockResolvedValue({
            id: '101',
            name: 'Updated Name',
            repoUrl: 'git@newrepo'
        });

        await command.run({ teamId: '1', projectId: '101', name: 'Updated Name', repo: 'git@newrepo' });

        expect(mockClient.projects.update).toHaveBeenCalledWith(1, 101, {
            name: 'Updated Name',
            repoUrl: 'git@newrepo',
        });
        expect(command.success).toHaveBeenCalledWith('Project 101 updated!');

    });

    it('should handle update failure', async () => {
        mockClient.projects.update.mockRejectedValue(new Error('Update failed'));

        await command.run({ teamId: '1', projectId: '101', name: 'New Name' });

        expect(command.error).toHaveBeenCalledWith('Failed to update project: Update failed');
    });
});
