import { logger } from '@nexical/cli-core';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Discovers command directories to load into the CLI.
 * 
 * Scans for:
 * 1. Core commands (projectRoot/src/core/commands)
 * 2. Module commands (projectRoot/src/modules/ * /commands)
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
        path.join(projectRoot, 'src/core/src/commands'),
    ];

    possibleCorePaths.forEach(addDir);

    // 2. Module commands
    // 2. Module commands (src/modules for standalone CLI, modules for platform)
    const possibleModuleDirs = [
        path.join(projectRoot, 'src/modules'),
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

    // 3. Package commands (e.g. platform/core/packages/*)
    // This assumes we are running in the context of platform/core or similar workspace
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

    // 4. Platform Core Packages (e.g. platform/core/packages/*)
    const platformPackagesDir = path.join(projectRoot, 'platform/core/packages');
    if (fs.existsSync(platformPackagesDir)) {
        try {
            const packages = fs.readdirSync(platformPackagesDir);
            for (const pkg of packages) {
                if (pkg.startsWith('.')) continue;

                const pkgPath = path.join(platformPackagesDir, pkg);
                const pkgCommands = path.join(pkgPath, 'src/commands');

                if (fs.existsSync(pkgCommands) && fs.statSync(pkgCommands).isDirectory()) {
                    addDir(pkgCommands);
                }
            }
        } catch (e: any) {
            logger.debug(`Error scanning platform packages directory: ${e.message}`);
        }
    }

    return directories;
}
