
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsGetCommand from '../../../../src/commands/project/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsGetCommand', () => {
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
            id: '200',
            name: 'My Project',
            repoUrl: 'http://repo.git',
            productionUrl: 'http://prod.url',
            mode: 'managed'
        });

        await command.run({ teamId: '1', projectId: '200' });

        expect(mockClient.projects.get).toHaveBeenCalledWith(1, 200);
        expect(command.info).toHaveBeenCalledWith('Project Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:   200');
        expect(command.info).toHaveBeenCalledWith('  Name: My Project');
        expect(command.info).toHaveBeenCalledWith('  Repo: http://repo.git');
        expect(command.info).toHaveBeenCalledWith('  Prod: http://prod.url');
        expect(command.info).toHaveBeenCalledWith('  Mode: managed');
    });

    it('should display defaults for missing urls', async () => {
        mockClient.projects.get.mockResolvedValue({
            id: '200',
            name: 'My Project',
            mode: 'self_hosted'
        });

        await command.run({ teamId: '1', projectId: '200' });

        expect(command.info).toHaveBeenCalledWith('  Repo: N/A');
        expect(command.info).toHaveBeenCalledWith('  Prod: N/A');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '200' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.projects.get).not.toHaveBeenCalled();
    });

    it('should handle get failure', async () => {
        mockClient.projects.get.mockRejectedValue(new Error('Project not found'));

        await command.run({ teamId: '1', projectId: '200' });

        expect(command.error).toHaveBeenCalledWith('Failed to get project: Project not found');
    });
});
