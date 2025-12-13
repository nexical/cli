
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WhoamiCommand from '../../../src/commands/whoami.js';
import { getClient } from '../../../src/utils/nexical-client.js';

vi.mock('../../../src/utils/nexical-client.js');

describe('WhoamiCommand Integration', () => {
    let command: WhoamiCommand;
    let mockClient: any;

    beforeEach(() => {
        vi.resetAllMocks();

        mockClient = {
            users: {
                me: vi.fn(),
            },
        };
        vi.mocked(getClient).mockReturnValue(mockClient);

        command = new WhoamiCommand([], {} as any);
        vi.spyOn(command, 'info').mockImplementation(() => { });
        vi.spyOn(command, 'error').mockImplementation(() => { });
    });

    it('should display user info when logged in', async () => {
        mockClient.users.me.mockResolvedValue({
            fullName: 'Integration User',
            email: 'int@example.com',
            id: 'user-int'
        });

        await command.run();

        expect(command.info).toHaveBeenCalledWith('Logged in as:');
        expect(command.info).toHaveBeenCalledWith('  Name:  Integration User');
        expect(command.info).toHaveBeenCalledWith('  Email: int@example.com');
        expect(command.info).toHaveBeenCalledWith('  ID:    user-int');
    });

    it('should display error when not logged in', async () => {
        mockClient.users.me.mockRejectedValue(new Error('Unauthorized'));

        await command.run();

        expect(command.error).toHaveBeenCalledWith('Not logged in or token expired. Run `astrical login`.');
    });
});
