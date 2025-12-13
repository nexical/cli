
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsListCommand from '../../../../src/commands/project/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsListCommand', () => {
    let command: ProjectsListCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            projects: {
                list: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new ProjectsListCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should list projects successfully', async () => {
        mockClient.projects.list.mockResolvedValue([
            { id: '200', name: 'Project A', repoUrl: 'http://a.git' },
            { id: '201', name: 'Project B' }
        ]);

        await command.run({ teamId: '1' });

        expect(mockClient.projects.list).toHaveBeenCalledWith(1);
        expect(command.info).toHaveBeenCalledWith('Projects in Team 1:');
        expect(command.info).toHaveBeenCalledWith('- Project A (ID: 200) [http://a.git]');
        expect(command.info).toHaveBeenCalledWith('- Project B (ID: 201) [No Repo]');
    });

    it('should handle empty list', async () => {
        mockClient.projects.list.mockResolvedValue([]);

        await command.run({ teamId: '1' });

        expect(command.info).toHaveBeenCalledWith('No projects found in team 1.');
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
        expect(mockClient.projects.list).not.toHaveBeenCalled();
    });

    it('should handle list failure', async () => {
        mockClient.projects.list.mockRejectedValue(new Error('Network error'));

        await command.run({ teamId: '1' });

        expect(command.error).toHaveBeenCalledWith('Failed to list projects: Network error');
    });
});
