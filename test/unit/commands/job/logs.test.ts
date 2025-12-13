
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsLogsCommand from '../../../../src/commands/job/logs.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsLogsCommand', () => {
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
        vi.spyOn(command, 'warn').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should display logs successfully', async () => {
        mockClient.jobs.getLogs.mockResolvedValue([
            { timestamp: '2023-01-01T10:00:00Z', level: 'info', message: 'Starting job' },
            { timestamp: '2023-01-01T10:00:01Z', level: 'warn', message: 'Slow network' },
            { timestamp: '2023-01-01T10:00:02Z', level: 'error', message: 'Failed to connect' }
        ]);

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '4' });

        expect(mockClient.jobs.getLogs).toHaveBeenCalledWith(1, 2, 3, 4);
        expect(command.info).toHaveBeenCalledWith('Logs for Job 4:');

        // Timestamps will be converted to locale string, so exact match depends on timezone.
        // We can just check that info, warn, error were called.
        expect(command.info).toHaveBeenCalledWith(expect.stringContaining('Starting job'));
        expect(command.warn).toHaveBeenCalledWith(expect.stringContaining('Slow network'));
        expect(command.error).toHaveBeenCalledWith(expect.stringContaining('Failed to connect'));
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.jobs.getLogs).not.toHaveBeenCalled();
    });

    it('should handle logs failure', async () => {
        mockClient.jobs.getLogs.mockRejectedValue(new Error('Logs not available'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', jobId: '4' });

        expect(command.error).toHaveBeenCalledWith('Failed to get logs: Logs not available');
    });
});
