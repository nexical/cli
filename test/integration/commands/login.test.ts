
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginCommand from '../../../src/commands/login.js';
import { getClient, saveToken } from '../../../src/utils/nexical-client.js';

vi.mock('../../../src/utils/nexical-client.js');

describe('LoginCommand Integration', () => {
    let command: LoginCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            auth: {
                authenticateDevice: vi.fn(),
            },
            users: {
                me: vi.fn(),
            },
            setToken: vi.fn(),
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new LoginCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'notice').mockImplementation(() => { });
        vi.spyOn(command, 'success').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should authenticate successfully', async () => {
        mockClient.auth.authenticateDevice.mockImplementation(async (_clientId: string, callback: any) => {
            callback('USER-CODE', 'https://verify.url');
            return 'new-token';
        });
        mockClient.users.me.mockResolvedValue({ fullName: 'Integration User', email: 'int@example.com' });

        await command.run();

        expect(command.info).toHaveBeenCalledWith('Starting device authentication...');
        expect(mockClient.auth.authenticateDevice).toHaveBeenCalledWith('nexical-cli', expect.any(Function));

        expect(command.notice).toHaveBeenCalledWith('Please visit: https://verify.url');
        expect(command.notice).toHaveBeenCalledWith('And enter code: USER-CODE');

        expect(saveToken).toHaveBeenCalledWith('new-token');
        expect(mockClient.setToken).toHaveBeenCalledWith('new-token');
        expect(mockClient.users.me).toHaveBeenCalled();
        expect(command.success).toHaveBeenCalledWith('Successfully logged in as Integration User (int@example.com)');
    });

    it('should handle authentication failure', async () => {
        mockClient.auth.authenticateDevice.mockRejectedValue(new Error('Auth failed'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Login failed: Auth failed');
        expect(saveToken).not.toHaveBeenCalled();
    });
});
