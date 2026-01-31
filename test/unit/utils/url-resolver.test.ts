import { describe, it, expect } from 'vitest';
import { resolveGitUrl } from '../../../src/utils/url-resolver';

describe('resolveGitUrl', () => {
    it('should expand gh@ shorthand correctly', () => {
        expect(resolveGitUrl('gh@nexical-cms/starter')).toBe('https://github.com/nexical-cms/starter.git');
    });

    it('should expand gh@ shorthand with subpath correctly', () => {
        expect(resolveGitUrl('gh@nexical-cms/starter//path/to/module')).toBe('https://github.com/nexical-cms/starter.git//path/to/module');
    });

    it('should add .git extension to standard URLs if missing', () => {
        expect(resolveGitUrl('https://github.com/nexical-cms/starter')).toBe('https://github.com/nexical-cms/starter.git');
    });

    it('should preserve .git extension if already present', () => {
        expect(resolveGitUrl('https://github.com/nexical-cms/starter.git')).toBe('https://github.com/nexical-cms/starter.git');
    });

    it('should handle standard URLs with subpath correctly', () => {
        expect(resolveGitUrl('https://github.com/nexical-cms/starter//path/to/dir')).toBe('https://github.com/nexical-cms/starter.git//path/to/dir');
    });

    it('should handle standard URLs with .git and subpath correctly', () => {
        expect(resolveGitUrl('https://github.com/nexical-cms/starter.git//path/to/dir')).toBe('https://github.com/nexical-cms/starter.git//path/to/dir');
    });

    it('should throw error for empty url', () => {
        expect(() => resolveGitUrl('')).toThrow('URL cannot be empty');
    });

    it('should not append .git to local paths', () => {
        expect(resolveGitUrl('/tmp/local/repo')).toBe('/tmp/local/repo');
        expect(resolveGitUrl('./local/repo')).toBe('./local/repo');
        expect(resolveGitUrl('../local/repo')).toBe('../local/repo');
        expect(resolveGitUrl('file:///tmp/repo')).toBe('file:///tmp/repo');
    });
});
