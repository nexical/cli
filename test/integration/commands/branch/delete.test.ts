
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesDeleteCommand from '../../../../src/commands/branch/delete.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesDeleteCommand Integration', () => {
    let command: BranchesDeleteCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            branches: {
                delete: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new BranchesDeleteCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should delete branch successfully', async () => {
        mockClient.branches.delete.mockResolvedValue({});

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(mockClient.branches.delete).toHaveBeenCalledWith(1, 2, 3);
        expect(command.success).toHaveBeenCalledWith('Branch 3 deleted.');
    });

    it('should handle deletion failure', async () => {
        mockClient.branches.delete.mockRejectedValue(new Error('Not found'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(command.error).toHaveBeenCalledWith('Failed to delete branch: Not found');
    });
});
