
import { NexicalClient } from '@nexical/sdk';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.nexical');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

interface Config {
    token?: string;
}

export function getConfig(): Config {
    if (!fs.existsSync(CONFIG_FILE)) {
        return {};
    }
    try {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        return {};
    }
}

export function saveToken(token: string) {
    if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    const config = getConfig();
    config.token = token;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export function getClient(): NexicalClient {
    const config = getConfig();
    return new NexicalClient({
        token: config.token,
    });
}
