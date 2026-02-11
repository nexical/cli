#!/usr/bin/env node
import { CLI, findProjectRoot } from '@nexical/cli-core';
import { fileURLToPath } from 'node:url';
import { discoverCommandDirectories } from './src/utils/discovery.js';
import pkg from './package.json';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const commandName = 'nexical';
const projectRoot = (await findProjectRoot(commandName, process.cwd())) || process.cwd();
const coreCommandsDir = path.resolve(__dirname, './src/commands');
const additionalCommands = discoverCommandDirectories(projectRoot);

// Filter out duplicate core commands and source versions
const filteredAdditional = additionalCommands.filter((dir) => {
  const resolvedDir = path.resolve(dir);
  const resolvedCore = path.resolve(coreCommandsDir);

  if (resolvedDir === resolvedCore) return false;

  // Check if this is another instance of the core CLI commands (by checking path suffix)
  const coreSuffix = path.join('@nexical', 'cli', 'dist', 'src', 'commands');
  const coreSuffixSrc = path.join('packages', 'cli', 'dist', 'src', 'commands');
  const coreSuffixRawSrc = path.join('packages', 'cli', 'src', 'commands');

  if (
    resolvedDir.endsWith(coreSuffix) ||
    resolvedDir.endsWith(coreSuffixSrc) ||
    resolvedDir.endsWith(coreSuffixRawSrc)
  ) {
    return false;
  }

  // Handle mismatch between dist/src and src/
  if (resolvedCore.includes(path.join(path.sep, 'dist', 'src', 'commands'))) {
    const srcVersion = resolvedCore.replace(
      path.join(path.sep, 'dist', 'src', 'commands'),
      path.join(path.sep, 'src', 'commands'),
    );
    if (resolvedDir === srcVersion) return false;
  }

  return true;
});

const app = new CLI({
  version: pkg.version,
  commandName: commandName,
  searchDirectories: [...new Set([coreCommandsDir, ...filteredAdditional])],
});
app.start();
