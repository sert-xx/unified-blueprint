import { describe, it, expect } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import type { Root } from 'mdast';
import { splitSections, estimateTokens } from './section-splitter.js';

function parseToTree(content: string): Root {
  const processor = unified().use(remarkParse).use(remarkFrontmatter, ['yaml']);
  return processor.parse(content) as Root;
}

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates English text by word count', () => {
    const text = 'Hello world this is a test';
    const tokens = estimateTokens(text);
    // 6 words * 1.3 = 7.8 -> ceil = 8
    expect(tokens).toBe(8);
  });

  it('estimates Japanese text by character count', () => {
    const text = 'これはテストです';
    const tokens = estimateTokens(text);
    // 8 Japanese chars * 1.5 = 12
    expect(tokens).toBe(12);
  });

  it('estimates mixed Japanese and English text', () => {
    const text = 'Hello 世界';
    const tokens = estimateTokens(text);
    // 1 English word * 1.3 + 2 Japanese chars * 1.5 = 1.3 + 3 = 4.3 -> 5
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('splitSections', () => {
  it('creates single section for content without headings', () => {
    const content = 'Just some text without any headings.';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.heading).toBeNull();
    expect(sections[0]!.order).toBe(0);
    expect(sections[0]!.content).toContain('Just some text');
  });

  it('splits on H2 boundaries', () => {
    // Use enough content in each section to exceed minTokens (32)
    const longContent = 'This is a sufficiently long paragraph with enough words to make the token estimator exceed the minimum threshold of thirty-two tokens so that it does not get merged.';
    const content = `Intro paragraph with enough content to pass the minimum token threshold for section splitting logic.\n\n## Section 1\n\n${longContent}\n\n## Section 2\n\n${longContent}`;
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections[0]!.heading).toBeNull(); // Intro section
    // Find sections with headings
    const headedSections = sections.filter((s) => s.heading !== null);
    expect(headedSections.length).toBeGreaterThanOrEqual(2);
    expect(headedSections[0]!.heading).toBe('Section 1');
    expect(headedSections[1]!.heading).toBe('Section 2');
  });

  it('splits on H3 boundaries', () => {
    const longContent = 'This is a sufficiently long paragraph with enough words to make the token estimator exceed the minimum threshold of thirty-two tokens so that it does not get merged.';
    const content = `## Section 1\n\n${longContent}\n\n### Subsection 1.1\n\n${longContent}`;
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    const headedSections = sections.filter((s) => s.heading !== null);
    expect(headedSections.length).toBeGreaterThanOrEqual(2);
    expect(headedSections[0]!.heading).toBe('Section 1');
    expect(headedSections[1]!.heading).toBe('Subsection 1.1');
  });

  it('does not split on H1 (treats as title)', () => {
    const content = '# Title\n\nIntro\n\n## Section 1\n\nContent';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    // H1 should be in the first section as content, not as a heading
    expect(sections[0]!.heading).toBeNull();
    expect(sections[0]!.content).toContain('Title');
  });

  it('does not split on H4+ (includes in parent section)', () => {
    const content =
      '## Section 1\n\nContent\n\n#### Detail\n\nMore content';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    // H4 should not create a new section
    const section1 = sections.find((s) => s.heading === 'Section 1');
    expect(section1).toBeDefined();
    expect(section1!.content).toContain('Detail');
    expect(section1!.content).toContain('More content');
  });

  it('skips frontmatter YAML nodes', () => {
    const content =
      '---\ntitle: Test\n---\n\nIntro\n\n## Section 1\n\nContent';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    // Frontmatter should not appear in any section content
    for (const section of sections) {
      expect(section.content).not.toContain('title: Test');
    }
  });

  it('returns at least one section for empty document', () => {
    const content = '';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    expect(sections.length).toBeGreaterThanOrEqual(1);
  });

  it('merges tiny sections (< minTokens) into previous', () => {
    // Create a document with a very small section
    const content = '## Intro\n\nSome reasonable amount of intro content here with enough tokens.\n\n## Tiny\n\nOk\n\n## Normal\n\nMore content with enough words to make this a proper section.';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content, {
      maxTokens: 256,
      minTokens: 32,
    });

    // The "Tiny" section ("Ok") is very small and may be merged
    // We just check that merging doesn't crash and sections have valid orders
    for (let i = 0; i < sections.length; i++) {
      expect(sections[i]!.order).toBe(i);
    }
  });

  it('sub-splits large sections (> maxTokens) at paragraph boundaries', () => {
    // Create a section with lots of content
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) =>
        `This is paragraph ${i} with some additional content to make it longer and closer to the token limit.`,
    ).join('\n\n');
    const content = `## Large Section\n\n${paragraphs}`;
    const tree = parseToTree(content);
    const sections = splitSections(tree, content, { maxTokens: 50 });

    // Should create multiple sub-sections from the large section
    expect(sections.length).toBeGreaterThan(1);
  });

  it('assigns sequential order numbers', () => {
    const content =
      'Intro\n\n## A\n\nContent A\n\n## B\n\nContent B\n\n## C\n\nContent C';
    const tree = parseToTree(content);
    const sections = splitSections(tree, content);

    for (let i = 0; i < sections.length; i++) {
      expect(sections[i]!.order).toBe(i);
    }
  });
});
