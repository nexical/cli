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
            logger.debug(`Found command directory: ${resolved}`);
            directories.push(resolved);
            visited.add(resolved);
        } else {
            logger.debug(`Command directory not found (skipping): ${resolved}`);
        }
    };

    // 1. Core commands
    // Search in projectRoot
    const possibleCorePaths = [
        path.join(projectRoot, 'src/commands'),
    ];

    possibleCorePaths.forEach(addDir);

    // 2. Module commands
    const possibleModuleDirs = [
        path.join(projectRoot, 'modules')
    ];

    possibleModuleDirs.forEach(modulesDir => {
        if (fs.existsSync(modulesDir)) {
            try {
                const modules = fs.readdirSync(modulesDir);
                for (const mod of modules) {
                    // exclude system files/dirs like .keep
                    if (mod.startsWith('.')) continue;

                    const modPath = path.join(modulesDir, mod);
                    // Check for src/commands inside the module
                    const modCommands = path.join(modPath, 'src/commands');

                    if (fs.existsSync(modCommands) && fs.statSync(modCommands).isDirectory()) {
                        addDir(modCommands);
                    }
                }
            } catch (e: any) {
                logger.debug(`Error scanning modules directory ${modulesDir}: ${e.message}`);
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
                const pkgCommands = path.join(pkgPath, 'src/commands');

                if (fs.existsSync(pkgCommands) && fs.statSync(pkgCommands).isDirectory()) {
                    addDir(pkgCommands);
                }
            }
        } catch (e: any) {
            logger.debug(`Error scanning packages directory: ${e.message}`);
        }
    }

    return directories;
}
