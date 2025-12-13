
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesListCommand from '../../../../src/commands/branch/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesListCommand', () => {
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
            { id: '100', name: 'main' },
            { id: '101', name: 'dev' }
        ]);

        await command.run({ teamId: '1', projectId: '2' });

        expect(mockClient.branches.list).toHaveBeenCalledWith(1, 2);
        expect(command.info).toHaveBeenCalledWith('Branches for Project 2:');
        expect(command.info).toHaveBeenCalledWith('- main (ID: 100)');
        expect(command.info).toHaveBeenCalledWith('- dev (ID: 101)');
    });

    it('should handle empty list', async () => {
        mockClient.branches.list.mockResolvedValue([]);

        await command.run({ teamId: '1', projectId: '2' });

        expect(command.info).toHaveBeenCalledWith('No branches found.');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '2' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.branches.list).not.toHaveBeenCalled();
    });

    it('should handle list failure', async () => {
        mockClient.branches.list.mockRejectedValue(new Error('Network error'));

        await command.run({ teamId: '1', projectId: '2' });

        expect(command.error).toHaveBeenCalledWith('Failed to list branches: Network error');
    });
});
