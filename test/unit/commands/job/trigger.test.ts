
import { describe, it, expect, vi, beforeEach } from 'vitest';
import JobsTriggerCommand from '../../../../src/commands/job/trigger.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('JobsTriggerCommand', () => {
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
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should trigger job successfully', async () => {
        mockClient.jobs.create.mockResolvedValue({
            id: '100',
            status: 'pending'
        });

        await command.run({
            teamId: '1',
            projectId: '2',
            branchId: '3',
            type: 'deploy',
            input: '{"env":"prod"}'
        });

        expect(mockClient.jobs.create).toHaveBeenCalledWith(1, 2, 3, {
            type: 'deploy',
            inputs: { env: 'prod' }
        });
        expect(command.success).toHaveBeenCalledWith('Job 100 triggered successfully!');
        expect(command.info).toHaveBeenCalledWith('Status: pending');
    });

    it('should handle invalid JSON input', async () => {
        await command.run({
            teamId: '1',
            projectId: '2',
            branchId: '3',
            type: 'deploy',
            input: '{invalid-json'
        });

        expect(command.error).toHaveBeenCalledWith('Invalid JSON inputs.');
        expect(mockClient.jobs.create).not.toHaveBeenCalled();
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '2', branchId: '3', type: 'deploy' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
    });

    it('should handle trigger failure', async () => {
        mockClient.jobs.create.mockRejectedValue(new Error('Quota exceeded'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3', type: 'deploy' });

        expect(command.error).toHaveBeenCalledWith('Failed to trigger job: Quota exceeded');
    });
});
