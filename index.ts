#!/usr/bin/env node
import { CLI, findProjectRoot } from '@nexical/cli-core';
import { fileURLToPath } from 'node:url';
import { discoverCommandDirectories } from './src/utils/discovery.js';
import pkg from './package.json';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandName = 'nexical';
const projectRoot = await findProjectRoot(commandName, process.cwd()) || process.cwd();
const additionalCommands = discoverCommandDirectories(projectRoot);

const app = new CLI({
    version: pkg.version,
    commandName: commandName,
    searchDirectories: [
        path.resolve(__dirname, './src/commands'),
        ...additionalCommands
    ]
});
app.start();
