
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsCreateCommand from '../../../../src/commands/project/create.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsCreateCommand Integration', () => {
    let command: ProjectsCreateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            projects: {
                create: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new ProjectsCreateCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should create project successfully', async () => {
        mockClient.projects.create.mockResolvedValue({
            name: 'New Project',
            id: 'proj-1'
        });

        await command.run({ teamId: '1', name: 'New Project', repo: 'git@repo', prod: 'http://prod.com' });

        expect(mockClient.projects.create).toHaveBeenCalledWith(1, {
            name: 'New Project',
            repoUrl: 'git@repo',
            productionUrl: 'http://prod.com',
            mode: undefined
        });
        expect(command.success).toHaveBeenCalledWith('Project "New Project" set up successfully!');
        expect(command.info).toHaveBeenCalledWith('ID: proj-1');
    });

    it('should handle creation failure', async () => {
        mockClient.projects.create.mockRejectedValue(new Error('Project exists'));

        await command.run({ teamId: '1', name: 'New Project' });

        expect(command.error).toHaveBeenCalledWith('Failed to create project: Project exists');
    });
});
