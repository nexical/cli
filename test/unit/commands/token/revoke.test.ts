
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthTokensRevokeCommand from '../../../../src/commands/token/revoke.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AuthTokensRevokeCommand', () => {
    let command: AuthTokensRevokeCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            auth: {
                revokeToken: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new AuthTokensRevokeCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should revoke token successfully', async () => {
        mockClient.auth.revokeToken.mockResolvedValue({});

        await command.run({ id: '123' });

        expect(mockClient.auth.revokeToken).toHaveBeenCalledWith(123);
        expect(command.success).toHaveBeenCalledWith('Token 123 revoked.');
    });

    it('should validate ID', async () => {
        await command.run({ id: 'invalid' });
        expect(command.error).toHaveBeenCalledWith('Token ID must be a number.');
        expect(mockClient.auth.revokeToken).not.toHaveBeenCalled();
    });

    it('should handle revocation failure', async () => {
        mockClient.auth.revokeToken.mockRejectedValue(new Error('Token not found'));

        await command.run({ id: '123' });

        expect(command.error).toHaveBeenCalledWith('Failed to revoke token: Token not found');
    });
});
