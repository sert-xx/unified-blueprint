import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from './frontmatter-parser.js';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter with all fields', () => {
    const yaml = `title: 認証フロー\ndoc_type: design\nsource_refs:\n  - src/auth/login.ts\n  - src/auth/token.ts`;
    const result = parseFrontmatter(yaml, 'test.md');

    expect(result.data.title).toBe('認証フロー');
    expect(result.data.doc_type).toBe('design');
    expect(result.data.source_refs).toEqual([
      'src/auth/login.ts',
      'src/auth/token.ts',
    ]);
    expect(result.warnings).toHaveLength(0);
  });

  it('returns empty data for empty yaml string', () => {
    const result = parseFrontmatter('', 'test.md');
    expect(result.data).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('returns empty data for whitespace-only yaml', () => {
    const result = parseFrontmatter('   \n  ', 'test.md');
    expect(result.data).toEqual({});
    expect(result.warnings).toHaveLength(0);
  });

  it('handles missing optional fields', () => {
    const yaml = 'title: Hello';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.title).toBe('Hello');
    expect(result.data.doc_type).toBeUndefined();
    expect(result.data.source_refs).toBeUndefined();
    expect(result.warnings).toHaveLength(0);
  });

  it('falls back to "spec" for invalid doc_type with warning', () => {
    const yaml = 'doc_type: unknown_type';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.doc_type).toBe('spec');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('Invalid doc_type');
  });

  it('accepts all valid doc_types', () => {
    const validTypes = [
      'spec',
      'design',
      'adr',
      'guide',
      'api',
      'meeting',
      'todo',
      'other',
    ];
    for (const docType of validTypes) {
      const result = parseFrontmatter(`doc_type: ${docType}`, 'test.md');
      expect(result.data.doc_type).toBe(docType);
      expect(result.warnings).toHaveLength(0);
    }
  });

  it('warns on path traversal in source_refs', () => {
    const yaml = 'source_refs:\n  - ../secret/file.ts\n  - src/valid.ts';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.source_refs).toEqual(['src/valid.ts']);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('Path traversal');
  });

  it('warns when source_refs is not an array', () => {
    const yaml = 'source_refs: not-an-array';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.source_refs).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('must be an array');
  });

  it('handles invalid YAML gracefully', () => {
    const yaml = '{{invalid yaml: [}';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data).toEqual({});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.type).toBe('invalid_frontmatter');
  });

  it('handles scalar YAML (non-object) with warning', () => {
    const yaml = '"just a string"';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data).toEqual({});
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain('not a valid YAML object');
  });

  it('trims title whitespace', () => {
    const yaml = 'title: "  Spaced Title  "';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.title).toBe('Spaced Title');
  });

  it('ignores non-string title', () => {
    const yaml = 'title: 42';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.title).toBeUndefined();
  });

  it('filters non-string entries from source_refs', () => {
    const yaml = 'source_refs:\n  - src/valid.ts\n  - 42\n  - true';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.source_refs).toEqual(['src/valid.ts']);
  });

  it('returns undefined source_refs when all entries are filtered', () => {
    const yaml = 'source_refs:\n  - ../bad.ts';
    const result = parseFrontmatter(yaml, 'test.md');
    expect(result.data.source_refs).toBeUndefined();
  });
});
