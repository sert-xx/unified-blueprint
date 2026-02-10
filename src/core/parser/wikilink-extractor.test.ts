import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import { remarkWikiLink, assignSectionOrders } from './wikilink-extractor.js';
import type { ParsedLink } from '../../shared/types.js';

function extractLinks(content: string): {
  links: ParsedLink[];
  warnings: Array<{ type: string; message: string }>;
} {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkWikiLink);

  const tree = processor.parse(content);
  const vfile = {
    value: content,
    path: 'test.md',
    data: {} as Record<string, unknown>,
    messages: [],
    toString: () => content,
  };
  processor.runSync(tree, vfile);

  return {
    links: (vfile.data['wikilinks'] as ParsedLink[]) ?? [],
    warnings: (vfile.data['wikilinkWarnings'] as Array<{ type: string; message: string }>) ?? [],
  };
}

describe('remarkWikiLink', () => {
  it('extracts basic WikiLink [[Target]]', () => {
    const { links } = extractLinks('See [[ログイン機能]] for details.');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('ログイン機能');
    expect(links[0]!.type).toBe('references');
  });

  it('extracts WikiLink with type [[Target|type]]', () => {
    const { links } = extractLinks(
      'This [[認証フロー|depends_on]] the auth module.',
    );
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('認証フロー');
    expect(links[0]!.type).toBe('depends_on');
  });

  it('extracts all valid link types', () => {
    const types = [
      'references',
      'depends_on',
      'implements',
      'extends',
      'conflicts_with',
    ];
    for (const linkType of types) {
      const { links } = extractLinks(`[[Target|${linkType}]]`);
      expect(links).toHaveLength(1);
      expect(links[0]!.type).toBe(linkType);
    }
  });

  it('falls back to references for invalid link type', () => {
    const { links, warnings } = extractLinks('[[Target|invalid_type]]');
    expect(links).toHaveLength(1);
    expect(links[0]!.type).toBe('references');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain('Invalid link type');
  });

  it('extracts multiple WikiLinks in one paragraph', () => {
    const { links } = extractLinks(
      '[[PageA]] relates to [[PageB|implements]] and [[PageC]].',
    );
    expect(links).toHaveLength(3);
    expect(links[0]!.target).toBe('PageA');
    expect(links[1]!.target).toBe('PageB');
    expect(links[1]!.type).toBe('implements');
    expect(links[2]!.target).toBe('PageC');
  });

  it('extracts WikiLink with path [[path/Target]]', () => {
    const { links } = extractLinks('See [[api/認証エンドポイント]].');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('api/認証エンドポイント');
  });

  it('ignores WikiLinks inside code blocks', () => {
    const content = '```\n[[InCodeBlock]]\n```\n\nNormal text [[Valid]]';
    const { links } = extractLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('Valid');
  });

  it('handles empty target gracefully', () => {
    const { links } = extractLinks('[[]] some text');
    // Empty target is skipped
    expect(links).toHaveLength(0);
  });

  it('trims whitespace in target', () => {
    const { links } = extractLinks('[[  Spaced Target  ]]');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('Spaced Target');
  });

  it('trims whitespace in link type', () => {
    const { links } = extractLinks('[[Target| depends_on ]]');
    expect(links).toHaveLength(1);
    expect(links[0]!.type).toBe('depends_on');
  });

  it('extracts context around the link', () => {
    const content =
      'This is some preceding context. [[TargetPage]] And some following context.';
    const { links } = extractLinks(content);
    expect(links).toHaveLength(1);
    expect(links[0]!.context).toContain('TargetPage');
    expect(links[0]!.context.length).toBeGreaterThan(0);
  });

  it('handles document with no WikiLinks', () => {
    const { links } = extractLinks('Just plain text without any links.');
    expect(links).toHaveLength(0);
  });

  it('handles Japanese file names', () => {
    const { links } = extractLinks('参照: [[データベース設計]]');
    expect(links).toHaveLength(1);
    expect(links[0]!.target).toBe('データベース設計');
  });
});

describe('assignSectionOrders', () => {
  it('assigns section order based on content position', () => {
    const fullContent = 'Intro text\n\n## Section 1\n\nSee [[PageA]]\n\n## Section 2\n\nSee [[PageB]]';
    const links: ParsedLink[] = [
      { target: 'PageA', type: 'references', context: '', sectionOrder: 0 },
      { target: 'PageB', type: 'references', context: '', sectionOrder: 0 },
    ];
    const sections = [
      { content: 'Intro text', order: 0 },
      { content: 'See [[PageA]]', order: 1 },
      { content: 'See [[PageB]]', order: 2 },
    ];

    assignSectionOrders(links, sections, fullContent);
    expect(links[0]!.sectionOrder).toBe(1);
    expect(links[1]!.sectionOrder).toBe(2);
  });

  it('defaults to section 0 when position cannot be determined', () => {
    const links: ParsedLink[] = [
      {
        target: 'NonExistent',
        type: 'references',
        context: '',
        sectionOrder: 99,
      },
    ];
    const sections = [{ content: 'Some content', order: 0 }];

    assignSectionOrders(links, sections, 'Some content');
    expect(links[0]!.sectionOrder).toBe(0);
  });

  it('uses _searchPattern when available', () => {
    const fullContent = 'Intro\n\n## Section 1\n\nSee [page](./page.md)\n\n## Section 2\n\nMore text';
    const links: ParsedLink[] = [
      {
        target: 'page',
        type: 'references',
        context: '',
        sectionOrder: 0,
        _searchPattern: '](./page.md)',
      },
    ];
    const sections = [
      { content: 'Intro', order: 0 },
      { content: 'See [page](./page.md)', order: 1 },
      { content: 'More text', order: 2 },
    ];

    assignSectionOrders(links, sections, fullContent);
    expect(links[0]!.sectionOrder).toBe(1);
  });

  it('falls back to WikiLink pattern when _searchPattern is not set', () => {
    const fullContent = 'Intro\n\n## Section 1\n\nSee [[PageA]]';
    const links: ParsedLink[] = [
      { target: 'PageA', type: 'references', context: '', sectionOrder: 0 },
    ];
    const sections = [
      { content: 'Intro', order: 0 },
      { content: 'See [[PageA]]', order: 1 },
    ];

    assignSectionOrders(links, sections, fullContent);
    expect(links[0]!.sectionOrder).toBe(1);
  });
});
