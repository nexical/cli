
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsGetCommand from '../../../../src/commands/job/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsGetCommand Integration', () => {
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
            id: '123',
            type: 'build',
            status: 'success',
            createdAt: '2023-01-01T00:00:00Z',
            finishedAt: '2023-01-01T00:05:00Z',
            startedAt: '2023-01-01T00:01:00Z',
            completedAt: '2023-01-01T00:05:00Z',
            queue: 'default'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '123' });

        expect(mockClient.jobs.get).toHaveBeenCalledWith(1, 2, 3, 123);
        expect(command.info).toHaveBeenCalledWith('Job Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:      123');
        expect(command.info).toHaveBeenCalledWith('  Status:  success');
    });

    it('should handle get failure', async () => {
        mockClient.jobs.get.mockRejectedValue(new Error('Job not found'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '123' });

        expect(command.error).toHaveBeenCalledWith('Failed to get job: Job not found');
    });
});
