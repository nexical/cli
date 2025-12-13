
import { describe, it, expect, vi, beforeEach } from 'vitest';
import BranchesCreateCommand from '../../../../src/commands/branch/create.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('BranchesCreateCommand', () => {
    let command: BranchesCreateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            branches: {
                create: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new BranchesCreateCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should create branch successfully', async () => {
        mockClient.branches.create.mockResolvedValue({
            name: 'main',
            id: '100'
        });

        await command.run({ teamId: '1', projectId: '2', name: 'main', preview: 'http://test.com' });

        expect(mockClient.branches.create).toHaveBeenCalledWith(1, 2, {
            name: 'main',
            previewUrl: 'http://test.com',
        });
        expect(command.success).toHaveBeenCalledWith('Branch "main" created!');
        expect(command.info).toHaveBeenCalledWith('ID: 100');
    });

    it('should validate IDs', async () => {
        await command.run({ teamId: 'invalid', projectId: '2', name: 'main' });
        expect(command.error).toHaveBeenCalledWith('IDs must be numbers.');
        expect(mockClient.branches.create).not.toHaveBeenCalled();
    });

    it('should handle creation failure', async () => {
        mockClient.branches.create.mockRejectedValue(new Error('Branch exists'));

        await command.run({ teamId: '1', projectId: '2', name: 'main' });

        expect(command.error).toHaveBeenCalledWith('Failed to create branch: Branch exists');
    });
});
