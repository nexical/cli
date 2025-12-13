
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getConfig, saveToken, getClient } from '../../../src/utils/nexical-client.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { NexicalClient } from '@nexical/sdk';

vi.mock('node:fs');
vi.mock('node:fs');
vi.mock('node:os', () => ({
    default: {
        homedir: vi.fn(() => '/home/user')
    }
}));
vi.mock('@nexical/sdk');

describe('nexical-client', () => {
    const mockHomeDir = '/home/user';
    const configDir = path.join(mockHomeDir, '.nexical');
    const configFile = path.join(configDir, 'config.json');

    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv('HOME', '/home/user');
        // os.homedir is already mocked by factory
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('should use os.homedir() if HOME env var is not set', () => {
        vi.unstubAllEnvs();
        vi.stubEnv('HOME', '');

        // Trigger path resolution
        getConfig();

        expect(os.homedir).toHaveBeenCalled();
    });

    describe('getConfig', () => {
        it('should return empty object if config file does not exist', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);
            expect(getConfig()).toEqual({});
            expect(fs.existsSync).toHaveBeenCalledWith(configFile);
        });

        it('should return parsed config if file exists', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'test-token' }));
            expect(getConfig()).toEqual({ token: 'test-token' });
            expect(fs.readFileSync).toHaveBeenCalledWith(configFile, 'utf-8');
        });

        it('should return empty object on JSON parse error', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue('invalid-json');
            expect(getConfig()).toEqual({});
        });
    });

    describe('saveToken', () => {
        it('should create directory if it does not exist', () => {
            vi.mocked(fs.existsSync)
                .mockReturnValueOnce(false) // config dir check
                .mockReturnValueOnce(false); // config file check (inside getConfig)

            saveToken('new-token');

            expect(fs.mkdirSync).toHaveBeenCalledWith(configDir, { recursive: true });
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                configFile,
                JSON.stringify({ token: 'new-token' }, null, 2)
            );
        });

        it('should update existing config', () => {
            vi.mocked(fs.existsSync)
                .mockReturnValueOnce(true) // config dir check
                .mockReturnValueOnce(true); // config file check (inside getConfig)
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ other: 'value' }));

            saveToken('new-token');

            expect(fs.mkdirSync).not.toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                configFile,
                JSON.stringify({ other: 'value', token: 'new-token' }, null, 2)
            );
        });
    });

    describe('getClient', () => {
        it('should return NexicalClient instance with token from config', () => {
            vi.mocked(fs.existsSync).mockReturnValue(true);
            vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ token: 'saved-token' }));

            getClient();

            expect(NexicalClient).toHaveBeenCalledWith({ token: 'saved-token' });
        });

        it('should return NexicalClient instance without token if config missing', () => {
            vi.mocked(fs.existsSync).mockReturnValue(false);

            getClient();

            expect(NexicalClient).toHaveBeenCalledWith({ token: undefined });
        });
    });
});
