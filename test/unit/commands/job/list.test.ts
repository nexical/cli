
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsListCommand from '../../../../src/commands/job/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsListCommand', () => {
    let command: JobsListCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            jobs: {
                list: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new JobsListCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should list jobs successfully', async () => {
        mockClient.jobs.list.mockResolvedValue([
            { id: '100', type: 'preview', status: 'completed', startedAt: '2023-01-01' },
            { id: '101', type: 'deploy', status: 'running' }
        ]);

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(mockClient.jobs.list).toHaveBeenCalledWith(1, 2, 3);
        expect(command.info).toHaveBeenCalledWith('Jobs for Branch 3:');
        expect(command.info).toHaveBeenCalledWith('100 - preview [completed] (Started: 2023-01-01)');
        expect(command.info).toHaveBeenCalledWith('101 - deploy [running] (Started: Waiting)');
    });

    it('should handle empty list', async () => {
        mockClient.jobs.list.mockResolvedValue([]);

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(command.info).toHaveBeenCalledWith('No jobs found.');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: '1', projectId: '2', branchId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.jobs.list).not.toHaveBeenCalled();
    });

    it('should handle list failure', async () => {
        mockClient.jobs.list.mockRejectedValue(new Error('Network error'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(command.error).toHaveBeenCalledWith('Failed to list jobs: Network error');
    });
});
