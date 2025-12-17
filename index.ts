#!/usr/bin/env node
import { CLI } from "@nexical/cli-core";
import { fileURLToPath } from "node:url";
import pkg from './package.json';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = new CLI({
  version: pkg.version,
  commandName: "nexical",
  searchDirectories: [path.resolve(__dirname, "./src/commands")],
});
app.start();
