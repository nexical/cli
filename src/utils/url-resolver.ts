/**
 * Resolves a git URL from various shorthand formats.
 *
 * Supported formats:
 * - gh@org/repo -> https://github.com/org/repo.git
 * - gh@org/repo//path -> https://github.com/org/repo.git//path
 * - https://github.com/org/repo -> https://github.com/org/repo.git
 * - https://github.com/org/repo.git -> https://github.com/org/repo.git
 *
 * @param url The URL string to resolve
 * @returns The fully qualified git URL with .git extension
 */
export function resolveGitUrl(url: string): string {
  if (!url) {
    throw new Error('URL cannot be empty');
  }

  let resolved = url;

  // Handle gh@ syntax
  if (resolved.startsWith('gh@')) {
    resolved = resolved.replace(/^gh@/, 'https://github.com/');
  }

  // Handle subpaths (split by //)
  // We must be careful not to split the protocol (e.g. https://)
  const protocolMatch = resolved.match(/^[a-z0-9]+:\/\//i);
  let splitIndex = -1;

  if (protocolMatch) {
    splitIndex = resolved.indexOf('//', protocolMatch[0].length);
  } else {
    splitIndex = resolved.indexOf('//');
  }

  let repoUrl = resolved;
  let subPath = '';

  if (splitIndex !== -1) {
    repoUrl = resolved.substring(0, splitIndex);
    subPath = resolved.substring(splitIndex + 2);
  }

  // Ensure .git extension, but ONLY for remote URLs (not local paths)
  const isLocal =
    repoUrl.startsWith('/') ||
    repoUrl.startsWith('./') ||
    repoUrl.startsWith('../') ||
    repoUrl.startsWith('file:') ||
    repoUrl.startsWith('~');

  if (!isLocal && !repoUrl.endsWith('.git')) {
    repoUrl += '.git';
  }

  // Reconstruction
  if (subPath) {
    return `${repoUrl}//${subPath}`;
  }

  return repoUrl;
}
