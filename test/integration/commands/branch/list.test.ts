
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesListCommand from '../../../../src/commands/branch/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesListCommand Integration', () => {
    let command: BranchesListCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            branches: {
                list: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new BranchesListCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should list branches successfully', async () => {
        mockClient.branches.list.mockResolvedValue([
            { id: '100', name: 'integration-main' },
            { id: '101', name: 'integration-dev' }
        ]);

        await command.run({ teamId: '1', projectId: '2' });

        expect(mockClient.branches.list).toHaveBeenCalledWith(1, 2);
        expect(command.info).toHaveBeenCalledWith('Branches for Project 2:');
        expect(command.info).toHaveBeenCalledWith('- integration-main (ID: 100)');
    });

    it('should handle list failure', async () => {
        mockClient.branches.list.mockRejectedValue(new Error('Network error'));

        await command.run({ teamId: '1', projectId: '2' });

        expect(command.error).toHaveBeenCalledWith('Failed to list branches: Network error');
    });
});
