
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthTokensGenerateCommand from '../../../../src/commands/token/generate.js';
import { getClient } from '../../../../src/utils/nexical-client.js';

vi.mock('../../../../src/utils/nexical-client.js');

describe('AuthTokensGenerateCommand Integration', () => {
    let command: AuthTokensGenerateCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            auth: {
                generateToken: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new AuthTokensGenerateCommand([], {} as any);
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'warn').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should generate token successfully', async () => {
        mockClient.auth.generateToken.mockResolvedValue({
            name: 'My Token',
            token: 'secret-token'
        });

        await command.run({ name: 'My Token', scopes: 'read' });

        expect(mockClient.auth.generateToken).toHaveBeenCalledWith({
            name: 'My Token',
            scopes: ['read']
        });
        expect(command.success).toHaveBeenCalledWith('Token "My Token" generated!');
        expect(command.warn).toHaveBeenCalledWith('Token: secret-token');
    });

    it('should handle generation failure', async () => {
        mockClient.auth.generateToken.mockRejectedValue(new Error('Limit exceeded'));

        await command.run({ name: 'My Token' });

        expect(command.error).toHaveBeenCalledWith('Failed to generate token: Limit exceeded');
    });
});
