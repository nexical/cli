#!/usr/bin/env node
import { CLI, findProjectRoot } from '@nexical/cli-core';
import { fileURLToPath } from 'node:url';
import { discoverCommandDirectories } from './src/utils/discovery.js';
import pkg from './package.json';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandName = 'nexical';
const projectRoot = await findProjectRoot(commandName, process.cwd()) || process.cwd();
const coreCommandsDir = path.resolve(__dirname, './src/commands');
const additionalCommands = discoverCommandDirectories(projectRoot);

// Filter out the source version of core commands if we are running from dist
const filteredAdditional = additionalCommands.filter(dir => {
    if (dir === coreCommandsDir) return false;

    // Handle the case where we are running from dist/ and it finds src/commands in projectRoot
    if (coreCommandsDir.includes(path.join(path.sep, 'dist', 'src', 'commands'))) {
        const srcVersion = coreCommandsDir.replace(
            path.join(path.sep, 'dist', 'src', 'commands'),
            path.join(path.sep, 'src', 'commands')
        );
        if (dir === srcVersion) return false;
    }
    return true;
});

const app = new CLI({
    version: pkg.version,
    commandName: commandName,
    searchDirectories: [...new Set([
        coreCommandsDir,
        ...filteredAdditional
    ])]
});
app.start();
