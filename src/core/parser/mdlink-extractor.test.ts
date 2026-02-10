import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkMarkdownLink } from './mdlink-extractor.js';
import type { ParsedLink } from '../../shared/types.js';

function extractLinks(
  content: string,
  filepath = 'test.md',
): ParsedLink[] {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkMarkdownLink);

  const tree = processor.parse(content);
  const vfile = {
    value: content,
    path: filepath,
    data: {} as Record<string, unknown>,
    messages: [],
    toString: () => content,
  };
  processor.runSync(tree, vfile);

  return (vfile.data['mdlinks'] as ParsedLink[]) ?? [];
}

describe('remarkMarkdownLink', () => {
  it('extracts basic markdown link [text](./sibling.md)', () => {
    const links = extractLinks('See [sibling](./sibling.md) for details.');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('sibling');
    expect(links[0]!.type).toBe('references');
  });

  it('resolves relative path from source directory', () => {
    const links = extractLinks(
      'See [endpoint](../api/endpoint.md) for details.',
      'guides/auth.md',
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('api/endpoint');
  });

  it('ignores external URLs (https)', () => {
    const links = extractLinks('Visit [example](https://example.com).');
    expect(links).toHaveLength(0);
  });

  it('ignores external URLs (http)', () => {
    const links = extractLinks('Visit [example](http://example.com).');
    expect(links).toHaveLength(0);
  });

  it('ignores mailto links', () => {
    const links = extractLinks('Email [me](mailto:test@example.com).');
    expect(links).toHaveLength(0);
  });

  it('ignores anchor-only links', () => {
    const links = extractLinks('See [section](#some-section) below.');
    expect(links).toHaveLength(0);
  });

  it('strips anchor fragment from .md links', () => {
    const links = extractLinks('See [section](./page.md#section) below.');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('page');
  });

  it('strips query string from .md links', () => {
    const links = extractLinks('See [page](./page.md?foo=bar).');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('page');
  });

  it('ignores non-.md file links', () => {
    const links = extractLinks('See [image](./image.png) here.');
    expect(links).toHaveLength(0);
  });

  it('ignores non-.md file links without extension', () => {
    const links = extractLinks('See [page](./something) here.');
    expect(links).toHaveLength(0);
  });

  it('extracts context around the link', () => {
    const content =
      'This is some preceding context. [target page](./target.md) And some following context.';
    const links = extractLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]!.context).toContain('target');
    expect(links[0]!.context.length).toBeGreaterThan(0);
  });

  it('extracts multiple links', () => {
    const content =
      'See [pageA](./a.md) and [pageB](./b.md) and [pageC](./c.md).';
    const links = extractLinks(content);
    expect(links).toHaveLength(3);
    expect(links[0]!.target).toBe('a');
    expect(links[1]!.target).toBe('b');
    expect(links[2]!.target).toBe('c');
  });

  it('ignores links inside code blocks', () => {
    const content =
      '```\n[code link](./code.md)\n```\n\nNormal [valid](./valid.md)';
    const links = extractLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('valid');
  });

  it('type is always references', () => {
    const links = extractLinks('[page](./page.md)');
    expect(links).toHaveLength(1);
    expect(links[0]!.type).toBe('references');
  });

  it('prevents path traversal beyond docs root', () => {
    const links = extractLinks(
      '[evil](../../../etc/passwd.md)',
      'guides/auth.md',
    );
    expect(links).toHaveLength(0);
  });

  it('handles URL-encoded paths', () => {
    const links = extractLinks('[page](./my%20document.md)');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('my document');
  });

  it('sets _searchPattern for assignSectionOrders', () => {
    const links = extractLinks('[page](./page.md)');
    expect(links).toHaveLength(1);
    expect(links[0]!._searchPattern).toBe('](./page.md)');
  });

  it('handles document with no markdown links', () => {
    const links = extractLinks('Just plain text without any links.');
    expect(links).toHaveLength(0);
  });

  it('handles link without path (just filename)', () => {
    const links = extractLinks('[page](sibling.md)');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('sibling');
  });

  it('handles nested directory paths', () => {
    const links = extractLinks(
      '[deep](./a/b/c.md)',
      'docs/guide.md',
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('docs/a/b/c');
  });
});
