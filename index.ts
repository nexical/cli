#!/usr/bin/env node
import { CLI, findProjectRoot } from '@nexical/cli-core';
import { fileURLToPath } from 'node:url';
import { discoverCommandDirectories } from './src/utils/discovery.js';
import pkg from './package.json';
import path from 'node:path';
import { filterCommandDirectories } from './src/utils/filter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandName = 'nexical';
const projectRoot = (await findProjectRoot(commandName, process.cwd())) || process.cwd();
const coreCommandsDir = path.resolve(__dirname, './src/commands');
const additionalCommands = discoverCommandDirectories(projectRoot);

const filteredAdditional = filterCommandDirectories(additionalCommands, coreCommandsDir);

const app = new CLI({
  version: pkg.version,
  commandName: commandName,
  searchDirectories: [...new Set([coreCommandsDir, ...filteredAdditional])],
});
app.start();
