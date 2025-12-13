
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsTriggerCommand from '../../../../src/commands/job/trigger.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsTriggerCommand Integration', () => {
    let command: JobsTriggerCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            jobs: {
                create: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new JobsTriggerCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should trigger job successfully', async () => {
        mockClient.jobs.create.mockResolvedValue({ id: 'job-new' });

        await command.run({ teamId: '1', projectId: '2', branchId: '3', type: 'build' });

        expect(mockClient.jobs.create).toHaveBeenCalledWith(1, 2, 3, {
            type: 'build',
            inputs: {},
        });
        expect(command.success).toHaveBeenCalledWith('Job job-new triggered successfully!');
    });

    it('should trigger job with input', async () => {
        mockClient.jobs.create.mockResolvedValue({ id: 'job-new' });

        await command.run({ teamId: '1', projectId: '2', branchId: '3', type: 'deploy', input: '{"env":"prod"}' });

        expect(mockClient.jobs.create).toHaveBeenCalledWith(1, 2, 3, {
            type: 'deploy',
            inputs: { env: 'prod' },
        });
    });

    it('should handle trigger failure', async () => {
        mockClient.jobs.create.mockRejectedValue(new Error('Quota exceeded'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', type: 'build' });

        expect(command.error).toHaveBeenCalledWith('Failed to trigger job: Quota exceeded');
    });
});
