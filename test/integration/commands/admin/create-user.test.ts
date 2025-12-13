
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AdminUsersCreateSystemCommand from '../../../../src/commands/admin/create-user.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AdminUsersCreateSystemCommand Integration', () => {
    let command: AdminUsersCreateSystemCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            auth: {
                createSystemUser: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new AdminUsersCreateSystemCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should create system user successfully', async () => {
        mockClient.auth.createSystemUser.mockResolvedValue({
            user: { fullName: 'Integration User', id: 'sys-int' }
        });

        await command.run({ name: 'Integration User', email: 'sys-int@example.com', password: 'password123' });

        expect(mockClient.auth.createSystemUser).toHaveBeenCalledWith({
            fullName: 'Integration User',
            email: 'sys-int@example.com',
            password: 'password123'
        });
        expect(command.success).toHaveBeenCalledWith('System user "Integration User" created!');
        expect(command.info).toHaveBeenCalledWith('ID: sys-int');
    });

    it('should handle creation failure', async () => {
        mockClient.auth.createSystemUser.mockRejectedValue(new Error('Email already exists'));

        await command.run({ name: 'Integration User', email: 'sys-int@example.com', password: 'password123' });

        expect(command.error).toHaveBeenCalledWith('Failed to create system user: Email already exists');
    });
});
