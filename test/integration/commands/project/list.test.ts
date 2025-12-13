
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsListCommand from '../../../../src/commands/project/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsListCommand Integration', () => {
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
            { id: '101', name: 'Project A' },
            { id: '102', name: 'Project B' }
        ]);

        await command.run({ teamId: '1' });

        expect(mockClient.projects.list).toHaveBeenCalledWith(1);
        expect(command.info).toHaveBeenCalledWith('Projects in Team 1:');
        expect(command.info).toHaveBeenCalledWith('- Project A (ID: 101) [No Repo]');
    });

    it('should handle list failure', async () => {
        mockClient.projects.list.mockRejectedValue(new Error('Network error'));

        await command.run({ teamId: '1' });

        expect(command.error).toHaveBeenCalledWith('Failed to list projects: Network error');
    });
});
