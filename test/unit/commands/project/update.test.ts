
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsUpdateCommand from '../../../../src/commands/project/update.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsUpdateCommand', () => {
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
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should update project successfully', async () => {
        mockClient.projects.update.mockResolvedValue({ id: '200' });

        await command.run({
            teamId: '1',
            projectId: '200',
            name: 'Updated Name',
            repo: 'http://new.git'
        });

        expect(mockClient.projects.update).toHaveBeenCalledWith(1, 200, {
            name: 'Updated Name',
            repoUrl: 'http://new.git',
            productionUrl: undefined,
        });
        expect(command.success).toHaveBeenCalledWith('Project 200 updated!');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '200' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.projects.update).not.toHaveBeenCalled();
    });

    it('should handle update failure', async () => {
        mockClient.projects.update.mockRejectedValue(new Error('Not found'));

        await command.run({ teamId: '1', projectId: '200' });

        expect(command.error).toHaveBeenCalledWith('Failed to update project: Not found');
    });
});
