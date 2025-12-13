
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ProjectsCreateCommand from '../../../../src/commands/project/create.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('ProjectsCreateCommand', () => {
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
            id: '200'
        });

        await command.run({
            teamId: '1',
            name: 'New Project',
            repo: 'http://repo.git',
            prod: 'http://prod.url',
            mode: 'managed'
        });

        expect(mockClient.projects.create).toHaveBeenCalledWith(1, {
            name: 'New Project',
            repoUrl: 'http://repo.git',
            productionUrl: 'http://prod.url'
        });
        expect(command.success).toHaveBeenCalledWith('Project "New Project" set up successfully!');
        expect(command.info).toHaveBeenCalledWith('ID: 200');
    });

    it('should validate Team ID', async () => {
        await command.run({ teamId: 'invalid', name: 'New Project' });
        expect(command.error).toHaveBeenCalledWith('Team ID must be a number.');
        expect(mockClient.projects.create).not.toHaveBeenCalled();
    });

    it('should handle creation failure', async () => {
        mockClient.projects.create.mockRejectedValue(new Error('Name taken'));

        await command.run({ teamId: '1', name: 'New Project' });

        expect(command.error).toHaveBeenCalledWith('Failed to create project: Name taken');
    });
});
