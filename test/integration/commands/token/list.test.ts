
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthTokensListCommand from '../../../../src/commands/token/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AuthTokensListCommand Integration', () => {
    let command: AuthTokensListCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            auth: {
                listTokens: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new AuthTokensListCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should list tokens successfully', async () => {
        mockClient.auth.listTokens.mockResolvedValue({
            tokens: [
                { name: 'Token 1', tokenPrefix: 'abc', expiresAt: null }
            ]
        });

        await command.run();

        expect(mockClient.auth.listTokens).toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Your API Tokens:');
    });

    it('should handle list failure', async () => {
        mockClient.auth.listTokens.mockRejectedValue(new Error('Network error'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Failed to list tokens: Network error');
    });
});
