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

  const addDir = (dir: string) => {
    const resolved = path.resolve(dir);
    if (visited.has(resolved)) return;

    if (fs.existsSync(resolved)) {
      // Check if we already have a similar path (e.g. dist/src/commands vs src/commands)
      // If we are adding src/commands and dist/src/commands already exists in visited, skip it
      // and vice versa.
      const isSrc = resolved.endsWith(path.join('src', 'commands'));
      const isDist =
        resolved.includes(path.join('dist', 'src', 'commands')) ||
        resolved.endsWith(path.join('dist', 'commands'));

      if (isSrc) {
        const distEquivalent1 = resolved.replace(
          path.sep + 'src' + path.sep,
          path.sep + 'dist' + path.sep + 'src' + path.sep,
        );
        const distEquivalent2 = resolved.replace(
          path.sep + 'src' + path.sep,
          path.sep + 'dist' + path.sep,
        );
        if (visited.has(distEquivalent1) || visited.has(distEquivalent2)) {
          logger.debug(`Skipping ${resolved} because a dist version is already registered`);
          return;
        }
      }

      if (isDist) {
        const srcEquivalent1 = resolved.replace(path.sep + 'dist' + path.sep, path.sep);
        const srcEquivalent2 = resolved.replace(
          path.sep + 'dist' + path.sep + 'src' + path.sep,
          path.sep + 'src' + path.sep,
        );
        if (visited.has(srcEquivalent1) || visited.has(srcEquivalent2)) {
          // If we just added src, and now we find dist, we should actually REPLACE src with dist
          // but for now, the loop order prefers dist, so this case shouldn't happen much.
          // However, let's keep it simple.
          logger.debug(`Skipping ${resolved} because a src version is already registered`);
          return;
        }
      }

      logger.debug(`Found command directory: ${resolved}`);
      directories.push(resolved);
      visited.add(resolved);
    } else {
      logger.debug(`Command directory not found (skipping): ${resolved}`);
    }
  };

  // 1. Core commands
  // Search in projectRoot
  const possibleCorePaths = [path.join(projectRoot, 'src/commands')];

  possibleCorePaths.forEach(addDir);

  // 2. Module commands
  const possibleModuleDirs = [
    path.join(projectRoot, 'modules'),
    path.join(projectRoot, 'src', 'modules'), // Support both flat and src-nested
  ];

  possibleModuleDirs.forEach((modulesDir) => {
    if (fs.existsSync(modulesDir)) {
      try {
        const modules = fs.readdirSync(modulesDir);
        for (const mod of modules) {
          // exclude system files/dirs like .keep
          if (mod.startsWith('.')) continue;

          const modPath = path.join(modulesDir, mod);
          if (!fs.statSync(modPath).isDirectory()) continue;

          // Check for commands inside the module/package
          // Order matters: prefer dist if it exists
          const possibleCmdPaths = [
            path.join(modPath, 'dist/src/commands'),
            path.join(modPath, 'dist/commands'),
            path.join(modPath, 'src/commands'),
          ];

          for (const cmdPath of possibleCmdPaths) {
            if (fs.existsSync(cmdPath) && fs.statSync(cmdPath).isDirectory()) {
              addDir(cmdPath);
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof Error) {
          logger.debug(`Error scanning modules directory ${modulesDir}: ${e.message}`);
        } else {
          logger.debug(`Error scanning modules directory ${modulesDir}: ${String(e)}`);
        }
      }
    }
  });

  // 3. Package commands (e.g. packages/*)
  const packagesDir = path.join(projectRoot, 'packages');
  if (fs.existsSync(packagesDir)) {
    try {
      const packages = fs.readdirSync(packagesDir);
      for (const pkg of packages) {
        if (pkg.startsWith('.')) continue;

        const pkgPath = path.join(packagesDir, pkg);
        if (!fs.statSync(pkgPath).isDirectory()) continue;

        const possibleCmdPaths = [
          path.join(pkgPath, 'dist/src/commands'),
          path.join(pkgPath, 'dist/commands'),
          path.join(pkgPath, 'src/commands'),
        ];

        for (const cmdPath of possibleCmdPaths) {
          if (fs.existsSync(cmdPath) && fs.statSync(cmdPath).isDirectory()) {
            addDir(cmdPath);
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error) {
        logger.debug(`Error scanning packages directory: ${e.message}`);
      } else {
        logger.debug(`Error scanning packages directory: ${String(e)}`);
      }
    }
  }

  return directories;
}
