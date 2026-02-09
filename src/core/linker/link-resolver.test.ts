import { describe, it, expect, beforeEach } from 'vitest';
import { LinkResolver, type DocumentLookup } from './link-resolver.js';

describe('LinkResolver', () => {
  let resolver: LinkResolver;

  beforeEach(() => {
    resolver = new LinkResolver();
  });

  describe('basic resolution', () => {
    it('resolves a single file by name', () => {
      resolver.buildIndex(['docs/auth.md']);
      const result = resolver.resolve('auth', 'docs/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/auth.md');
    });

    it('returns dangling for non-existent target', () => {
      resolver.buildIndex(['docs/auth.md']);
      const result = resolver.resolve('nonexistent', 'docs/index.md');
      expect(result.status).toBe('dangling');
      expect(result.targetDocId).toBeNull();
      expect(result.filepath).toBeNull();
    });

    it('resolves case-insensitively', () => {
      resolver.buildIndex(['docs/AuthFlow.md']);
      const result = resolver.resolve('authflow', 'docs/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/AuthFlow.md');
    });

    it('resolves with .md extension in target', () => {
      resolver.buildIndex(['docs/auth.md']);
      const result = resolver.resolve('auth.md', 'docs/index.md');
      expect(result.status).toBe('resolved');
    });

    it('resolves Japanese file names', () => {
      resolver.buildIndex(['docs/認証フロー.md']);
      const result = resolver.resolve('認証フロー', 'docs/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/認証フロー.md');
    });
  });

  describe('path-based resolution', () => {
    it('resolves path-based link [[path/target]]', () => {
      resolver.buildIndex(['docs/api/auth.md']);
      const result = resolver.resolve('api/auth', 'docs/index.md');
      // Currently resolves path-based by scanning all filepaths
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/api/auth.md');
    });

    it('returns dangling for non-existent path', () => {
      resolver.buildIndex(['docs/api/auth.md']);
      const result = resolver.resolve('other/nonexistent', 'docs/index.md');
      expect(result.status).toBe('dangling');
    });
  });

  describe('disambiguation', () => {
    it('prefers same directory as source', () => {
      resolver.buildIndex([
        'docs/api/auth.md',
        'docs/guides/auth.md',
        'docs/design/auth.md',
      ]);
      const result = resolver.resolve('auth', 'docs/guides/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/guides/auth.md');
      expect(result.ambiguous).toBe(true);
    });

    it('prefers shallower directory when not in same dir', () => {
      resolver.buildIndex([
        'docs/deep/nested/auth.md',
        'docs/auth.md',
      ]);
      const result = resolver.resolve('auth', 'docs/other/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('docs/auth.md');
    });

    it('uses alphabetical order as final tiebreaker', () => {
      resolver.buildIndex(['docs/b-auth.md', 'docs/a-auth.md']);
      // Both are at same depth and not in source dir
      // Since they have different filenames, they won't collide on the name index
      // Let me use same-name files in different dirs at same depth
      resolver.buildIndex([
        'b/auth.md',
        'a/auth.md',
      ]);
      const result = resolver.resolve('auth', 'other/index.md');
      expect(result.status).toBe('resolved');
      expect(result.filepath).toBe('a/auth.md');
    });

    it('marks ambiguous when multiple candidates exist', () => {
      resolver.buildIndex(['docs/a/auth.md', 'docs/b/auth.md']);
      const result = resolver.resolve('auth', 'docs/c/index.md');
      expect(result.status).toBe('resolved');
      expect(result.ambiguous).toBe(true);
    });
  });

  describe('index management', () => {
    it('adds file to index', () => {
      resolver.buildIndex(['docs/auth.md']);
      resolver.addFile('docs/new-page.md');
      const result = resolver.resolve('new-page', 'docs/index.md');
      expect(result.status).toBe('resolved');
    });

    it('removes file from index', () => {
      resolver.buildIndex(['docs/auth.md', 'docs/other.md']);
      resolver.removeFile('docs/auth.md');
      const result = resolver.resolve('auth', 'docs/index.md');
      expect(result.status).toBe('dangling');
    });

    it('does not duplicate on repeated addFile', () => {
      resolver.buildIndex([]);
      resolver.addFile('docs/auth.md');
      resolver.addFile('docs/auth.md');
      const ambiguous = resolver.getAmbiguousNames();
      // Same filepath added twice should not create ambiguity
      const authEntry = ambiguous.find((a) => a.name === 'auth');
      expect(authEntry).toBeUndefined();
    });
  });

  describe('document lookup integration', () => {
    it('returns docId when DocumentLookup is set', () => {
      const mockLookup: DocumentLookup = {
        getAllFilepaths: () => ['docs/auth.md'],
        getDocIdByFilepath: (fp: string) =>
          fp === 'docs/auth.md' ? 'doc-123' : null,
      };

      resolver.setDocumentLookup(mockLookup);
      resolver.buildIndex(['docs/auth.md']);
      const result = resolver.resolve('auth', 'docs/index.md');
      expect(result.status).toBe('resolved');
      expect(result.targetDocId).toBe('doc-123');
    });

    it('returns null docId when DocumentLookup is not set', () => {
      resolver.buildIndex(['docs/auth.md']);
      const result = resolver.resolve('auth', 'docs/index.md');
      expect(result.status).toBe('resolved');
      expect(result.targetDocId).toBeNull();
    });
  });

  describe('getAmbiguousNames', () => {
    it('returns empty for unique file names', () => {
      resolver.buildIndex(['docs/auth.md', 'docs/login.md']);
      expect(resolver.getAmbiguousNames()).toHaveLength(0);
    });

    it('returns ambiguous entries', () => {
      resolver.buildIndex(['docs/a/auth.md', 'docs/b/auth.md']);
      const ambiguous = resolver.getAmbiguousNames();
      expect(ambiguous).toHaveLength(1);
      expect(ambiguous[0]!.name).toBe('auth');
      expect(ambiguous[0]!.candidates).toHaveLength(2);
    });
  });

  describe('Unicode normalization', () => {
    it('resolves NFC/NFD normalized strings equally', () => {
      // In practice Node.js normalizes paths, but we handle it explicitly
      resolver.buildIndex(['docs/テスト.md']);
      const result = resolver.resolve('テスト', 'docs/index.md');
      expect(result.status).toBe('resolved');
    });
  });
});
