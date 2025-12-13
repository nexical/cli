
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsGetCommand from '../../../../src/commands/project/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsGetCommand Integration', () => {
    let command: ProjectsGetCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            projects: {
                get: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new ProjectsGetCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should get project details successfully', async () => {
        mockClient.projects.get.mockResolvedValue({
            id: '101',
            name: 'My Project',
            repoUrl: 'git@repo',
            productionUrl: 'http://prod.com',
            mode: 'full'
        });

        await command.run({ teamId: '1', projectId: '101' });

        expect(mockClient.projects.get).toHaveBeenCalledWith(1, 101);
        expect(command.info).toHaveBeenCalledWith('Project Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:   101');
        expect(command.info).toHaveBeenCalledWith('  Name: My Project');
    });

    it('should handle get failure', async () => {
        mockClient.projects.get.mockRejectedValue(new Error('Project not found'));

        await command.run({ teamId: '1', projectId: '101' });

        expect(command.error).toHaveBeenCalledWith('Failed to get project: Project not found');
    });
});
