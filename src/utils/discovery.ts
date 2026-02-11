import { logger } from '@nexical/cli-core';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Discovers command directories to load into the CLI.
 *
 * Scans for:
 * 1. Core commands (projectRoot/src/commands)
 * 2. Module commands (projectRoot/src/modules/ * /src/commands)
 *
 * @param projectRoot - The root directory of the project
 * @returns Array of absolute paths to command directories
 */
export function discoverCommandDirectories(projectRoot: string): string[] {
  const directories: string[] = [];
  const visited = new Set<string>();

  const isTsEnvironment =
    process.argv[1]?.endsWith('.ts') ||
    process.execArgv.some((arg) => arg.includes('tsx') || arg.includes('ts-node'));

  const addDir = (dir: string) => {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) {
      logger.debug(`Command directory not found (skipping): ${resolved}`);
      return;
    }

    if (visited.has(resolved)) return;

    const isSrcDir = resolved.includes(path.join(path.sep, 'src', 'commands'));

    // Strict check: if we are adding a 'src' directory...
    if (isSrcDir) {
      // 1. Check if an equivalent 'dist' exists in the same package
      const distPath1 = resolved.replace(
        path.join(path.sep, 'src', 'commands'),
        path.join(path.sep, 'dist', 'src', 'commands'),
      );
      const distPath2 = resolved.replace(
        path.join(path.sep, 'src', 'commands'),
        path.join(path.sep, 'dist', 'commands'),
      );

      if (fs.existsSync(distPath1) || fs.existsSync(distPath2)) {
        logger.debug(`Skipping src commands at ${resolved} because dist exists`);
        return;
      }

      // 2. If no TS loader, skip src/commands entirely IF it's likely to contain .ts
      if (!isTsEnvironment) {
        logger.debug(`Skipping src commands at ${resolved}: no TS loader detected`);
        return;
      }
    }

    logger.debug(`Found command directory: ${resolved}`);
    directories.push(resolved);
    visited.add(resolved);
  };

  // 1. Core commands
  const possibleCorePaths = [path.join(projectRoot, 'src/commands')];
  possibleCorePaths.forEach(addDir);

  // 2. Module & Package commands
  const searchRoots = [
    path.join(projectRoot, 'modules'),
    path.join(projectRoot, 'src', 'modules'),
    path.join(projectRoot, 'packages'),
  ];

  searchRoots.forEach((root) => {
    if (!fs.existsSync(root)) return;
    try {
      const entries = fs.readdirSync(root);
      for (const entry of entries) {
        if (entry.startsWith('.')) continue;
        const entryPath = path.join(root, entry);
        if (!fs.statSync(entryPath).isDirectory()) continue;

        // Preference: dist/src/commands > dist/commands > src/commands
        const possiblePaths = [
          path.join(entryPath, 'dist/src/commands'),
          path.join(entryPath, 'dist/commands'),
          path.join(entryPath, 'src/commands'),
        ];

        let foundDist = false;
        for (const p of possiblePaths) {
          if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
            if (p.includes(path.sep + 'dist' + path.sep)) {
              addDir(p);
              foundDist = true;
              break; // Found a dist version, skip others for this entry
            }
          }
        }

        if (!foundDist) {
          const srcPath = path.join(entryPath, 'src/commands');
          if (fs.existsSync(srcPath) && fs.statSync(srcPath).isDirectory()) {
            addDir(srcPath);
          }
        }
      }
    } catch (e: unknown) {
      logger.debug(`Error scanning root ${root}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  return directories;
}
