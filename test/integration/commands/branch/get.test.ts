
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesGetCommand from '../../../../src/commands/branch/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesGetCommand Integration', () => {
    let command: BranchesGetCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            branches: {
                get: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new BranchesGetCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should get branch details successfully', async () => {
        mockClient.branches.get.mockResolvedValue({
            id: '100',
            name: 'integration-main',
            previewUrl: 'http://int.com'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '100' });

        expect(mockClient.branches.get).toHaveBeenCalledWith(1, 2, 100);
        expect(command.info).toHaveBeenCalledWith('Branch Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:   100');
        expect(command.info).toHaveBeenCalledWith('  Name: integration-main');
    });

    it('should handle get failure', async () => {
        mockClient.branches.get.mockRejectedValue(new Error('Not found'));

        await command.run({ teamId: '1', projectId: '2', branchId: '100' });

        expect(command.error).toHaveBeenCalledWith('Failed to get branch: Not found');
    });
});
