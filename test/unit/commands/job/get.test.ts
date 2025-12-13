
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsGetCommand from '../../../../src/commands/job/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsGetCommand', () => {
    let command: JobsGetCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            jobs: {
                get: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new JobsGetCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should get job details successfully', async () => {
        mockClient.jobs.get.mockResolvedValue({
            id: '100',
            type: 'preview',
            status: 'completed',
            startedAt: '2023-01-01',
            completedAt: '2023-01-02',
            queue: 'default'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '4' });

        expect(mockClient.jobs.get).toHaveBeenCalledWith(1, 2, 3, 4);
        expect(command.info).toHaveBeenCalledWith('Job Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:      100');
        expect(command.info).toHaveBeenCalledWith('  Type:    preview');
        expect(command.info).toHaveBeenCalledWith('  Status:  completed');
        expect(command.info).toHaveBeenCalledWith('  Started: 2023-01-01');
        expect(command.info).toHaveBeenCalledWith('  Ended:   2023-01-02');
        expect(command.info).toHaveBeenCalledWith('  Queue:   default');
    });

    it('should display defaults for missing times', async () => {
        mockClient.jobs.get.mockResolvedValue({
            id: '100',
            type: 'preview',
            status: 'pending',
            queue: 'default'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '4' });

        expect(command.info).toHaveBeenCalledWith('  Started: Waiting');
        expect(command.info).toHaveBeenCalledWith('  Ended:   Running');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.jobs.get).not.toHaveBeenCalled();
    });

    it('should handle get failure', async () => {
        mockClient.jobs.get.mockRejectedValue(new Error('Job not found'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '4' });

        expect(command.error).toHaveBeenCalledWith('Failed to get job: Job not found');
    });
});
