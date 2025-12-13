#!/usr/bin/env node
import { CLI, logger } from "@nexical/cli-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

logger.debug("CLI ENTRY POINT HIT", process.argv);

const app = new CLI({
  commandName: "app",
  searchDirectories: [path.resolve(__dirname, "./src/commands")],
});
app.start();
