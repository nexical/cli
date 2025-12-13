
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesGetCommand from '../../../../src/commands/branch/get.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesGetCommand', () => {
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
            name: 'main',
            previewUrl: 'http://test.com'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(mockClient.branches.get).toHaveBeenCalledWith(1, 2, 3);
        expect(command.info).toHaveBeenCalledWith('Branch Details:');
        expect(command.info).toHaveBeenCalledWith('  ID:   100');
        expect(command.info).toHaveBeenCalledWith('  Name: main');
        expect(command.info).toHaveBeenCalledWith('  Preview: http://test.com');
    });

    it('should show N/A for missing preview', async () => {
        mockClient.branches.get.mockResolvedValue({
            id: '100',
            name: 'main'
        });

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(command.info).toHaveBeenCalledWith('  Preview: N/A');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: '1', projectId: 'invalid', branchId: '3' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.branches.get).not.toHaveBeenCalled();
    });

    it('should handle get failure', async () => {
        mockClient.branches.get.mockRejectedValue(new Error('Not found'));

        await command.run({ teamId: '1', projectId: '2', branchId: '3' });

        expect(command.error).toHaveBeenCalledWith('Failed to get branch: Not found');
    });
});
