import path from 'node:path';

/**
 * Filters out duplicate core commands and source versions from additional command directories.
 * @param additionalCommands List of discovered command directories.
 * @param coreCommandsDir The primary core commands directory.
 * @returns Filtered list of additional command directories.
 */
export function filterCommandDirectories(
  additionalCommands: string[],
  coreCommandsDir: string,
): string[] {
  return additionalCommands.filter((dir) => {
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
    const distSuffix = path.join('dist', 'src', 'commands');
    const srcSuffix = path.join('src', 'commands');
    if (resolvedCore.endsWith(distSuffix)) {
      const baseDir = resolvedCore.substring(0, resolvedCore.length - distSuffix.length);
      const srcVersion = path.join(baseDir, srcSuffix);
      const normalizedDir = path.normalize(resolvedDir);
      const normalizedSrc = path.normalize(srcVersion);
      if (normalizedDir === normalizedSrc) {
        return false;
      }
    }

    return true;
  });
}
