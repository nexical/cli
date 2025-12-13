
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthTokensRevokeCommand from '../../../../src/commands/token/revoke.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AuthTokensRevokeCommand Integration', () => {
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

        await command.run({ id: '1' });

        expect(mockClient.auth.revokeToken).toHaveBeenCalledWith(1);
        expect(command.success).toHaveBeenCalledWith('Token 1 revoked.');
    });

    it('should handle revocation failure', async () => {
        mockClient.auth.revokeToken.mockRejectedValue(new Error('Not found'));

        await command.run({ id: '1' });

        expect(command.error).toHaveBeenCalledWith('Failed to revoke token: Not found');
    });
});
