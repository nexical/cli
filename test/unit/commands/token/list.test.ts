
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthTokensListCommand from '../../../../src/commands/token/list.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AuthTokensListCommand', () => {
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
                { name: 'Token 1', tokenPrefix: 'abc', expiresAt: '2023-01-01' },
                { name: 'Token 2', tokenPrefix: 'def' }
            ]
        });

        await command.run();

        expect(mockClient.auth.listTokens).toHaveBeenCalled();
        expect(command.info).toHaveBeenCalledWith('Your API Tokens:');
        expect(command.info).toHaveBeenCalledWith('- Token 1 (abc...) [Expires: 2023-01-01]');
        expect(command.info).toHaveBeenCalledWith('- Token 2 (def...) [Expires: Never]');
    });

    it('should handle empty list', async () => {
        mockClient.auth.listTokens.mockResolvedValue({ tokens: [] });

        await command.run();

        expect(command.info).toHaveBeenCalledWith('No API tokens found.');
    });

    it('should handle list failure', async () => {
        mockClient.auth.listTokens.mockRejectedValue(new Error('Network error'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Failed to list tokens: Network error');
    });
});
