
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsLogsCommand from '../../../../src/commands/job/logs.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsLogsCommand Integration', () => {
    let command: JobsLogsCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            jobs: {
                getLogs: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new JobsLogsCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should get job logs successfully', async () => {
        mockClient.jobs.getLogs.mockResolvedValue([
            { timestamp: '2023T12:00:00', level: 'info', message: 'Build started' },
            { timestamp: '2023T12:01:00', level: 'error', message: 'Build failed' }
        ]);

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '123' });

        expect(mockClient.jobs.getLogs).toHaveBeenCalledWith(1, 2, 3, 123);
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Build started'));
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Build failed'));
    });

    it('should handle log failure', async () => {
        mockClient.jobs.getLogs.mockRejectedValue(new Error('Logs unavailable'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '123' });

        expect(command.error).toHaveBeenCalledWith('Failed to get logs: Logs unavailable');
    });
});
