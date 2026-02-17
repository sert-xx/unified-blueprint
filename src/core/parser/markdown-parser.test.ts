import { describe, it, expect } from 'vitest';
import { parseMarkdown } from './markdown-parser.js';

describe('parseMarkdown', () => {
  it('parses basic markdown with frontmatter', () => {
    const longPara = 'This is a sufficiently long paragraph with enough words to make the token estimator exceed the minimum threshold of thirty-two tokens so that it does not get merged into the adjacent section.';
    const content = `---
title: テストドキュメント
doc_type: design
---

# テストドキュメント

## 概要

${longPara}

## 詳細

${longPara}
`;
    const result = parseMarkdown(content, 'test.md');

    expect(result.title).toBe('テストドキュメント');
    expect(result.frontmatter.title).toBe('テストドキュメント');
    expect(result.frontmatter.doc_type).toBe('design');
    expect(result.sections.length).toBeGreaterThanOrEqual(2);
  });

  it('extracts WikiLinks from content', () => {
    const content = `## Overview

See [[ログイン機能]] and [[認証フロー|depends_on]] for details.
`;
    const result = parseMarkdown(content, 'test.md');

    expect(result.links).toHaveLength(2);
    expect(result.links[0]!.target).toBe('ログイン機能');
    expect(result.links[0]!.type).toBe('references');
    expect(result.links[1]!.target).toBe('認証フロー');
    expect(result.links[1]!.type).toBe('depends_on');
  });

  it('resolves title from frontmatter', () => {
    const content = `---
title: FM Title
---

# H1 Title

Content`;
    const result = parseMarkdown(content, 'filename.md');
    expect(result.title).toBe('FM Title');
  });

  it('resolves title from filepath when no frontmatter title (H1 is ignored)', () => {
    const content = `# H1 Title

Content`;
    const result = parseMarkdown(content, 'filename.md');
    expect(result.title).toBe('filename');
  });

  it('resolves title from filename when no frontmatter or H1', () => {
    const content = `## Section Only

Content`;
    const result = parseMarkdown(content, 'my-document.md');
    expect(result.title).toBe('my-document');
  });

  it('handles empty content', () => {
    const result = parseMarkdown('', 'empty.md');
    expect(result.title).toBe('empty');
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
    expect(result.links).toHaveLength(0);
  });

  it('handles content with no frontmatter', () => {
    const content = `# Simple Document

Just some content here.`;
    const result = parseMarkdown(content, 'simple.md');
    expect(result.title).toBe('simple');
    expect(result.frontmatter.title).toBeUndefined();
    expect(result.frontmatter.doc_type).toBeUndefined();
  });

  it('parses document with all features', () => {
    const longPara = 'This is a sufficiently long paragraph with enough words to make the token estimator exceed the minimum threshold of thirty-two tokens so that it does not get merged into adjacent sections during post-processing.';
    const content = `---
title: 認証設計書
doc_type: design
source_refs:
  - src/auth/login.ts
---

# 認証設計書

## 概要

この設計書は[[要件定義|depends_on]]に基づく認証フローを記述する。${longPara}

## 実装

認証は[[JWTトークン|implements]]パターンを使用する。${longPara}

### トークン管理

トークンの有効期限は30分とする。${longPara}

## 関連文書

${longPara}

- [[API仕様]]
- [[セキュリティポリシー|references]]
`;
    const result = parseMarkdown(content, 'auth-design.md');

    expect(result.title).toBe('認証設計書');
    expect(result.frontmatter.doc_type).toBe('design');
    expect(result.frontmatter.source_refs).toEqual(['src/auth/login.ts']);
    expect(result.links.length).toBeGreaterThanOrEqual(4);
    expect(result.sections.length).toBeGreaterThanOrEqual(3);
  });

  it('handles malformed frontmatter gracefully', () => {
    const content = `---
{invalid yaml: [
---

## Content

Some text here.`;
    // Should not throw
    const result = parseMarkdown(content, 'bad-fm.md');
    expect(result.title).toBe('bad-fm');
    expect(result.sections.length).toBeGreaterThanOrEqual(1);
  });

  it('handles nested path in filepath for title resolution', () => {
    const result = parseMarkdown('Some content', 'docs/guides/setup.md');
    expect(result.title).toBe('docs/guides/setup');
  });

  it('extracts standard Markdown links as references', () => {
    const content = `## Overview

See [auth guide](./auth.md) for details.
`;
    const result = parseMarkdown(content, 'index.md');

    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.target).toBe('auth');
    expect(result.links[0]!.type).toBe('references');
  });

  it('extracts both WikiLinks and Markdown links', () => {
    const content = `## Overview

See [[PageA]] and [PageB](./page-b.md) for details.
`;
    const result = parseMarkdown(content, 'test.md');

    expect(result.links).toHaveLength(2);
    expect(result.links[0]!.target).toBe('PageA');
    expect(result.links[1]!.target).toBe('page-b');
  });

  it('deduplicates when WikiLink and Markdown link point to same target', () => {
    const content = `## Overview

See [[auth]] and [auth guide](./auth.md) for details.
`;
    const result = parseMarkdown(content, 'test.md');

    // WikiLink target "auth" and md link target "auth" should deduplicate
    expect(result.links).toHaveLength(1);
    expect(result.links[0]!.target).toBe('auth');
  });

  it('handles document with only Markdown links', () => {
    const content = `## Guide

Read [setup](./setup.md) and [config](./config.md).
`;
    const result = parseMarkdown(content, 'index.md');

    expect(result.links).toHaveLength(2);
    expect(result.links[0]!.target).toBe('setup');
    expect(result.links[1]!.target).toBe('config');
  });

  it('assigns section orders to Markdown links', () => {
    const longPara = 'This is a sufficiently long paragraph with enough words to make the token estimator exceed the minimum threshold of thirty-two tokens so that it does not get merged into adjacent sections during post-processing.';
    const content = `## Section 1

${longPara}

## Section 2

See [page](./page.md) for details. ${longPara}
`;
    const result = parseMarkdown(content, 'test.md');

    const mdLink = result.links.find((l) => l.target === 'page');
    expect(mdLink).toBeDefined();
    // The link should be in the second section (order >= 1)
    expect(mdLink!.sectionOrder).toBeGreaterThanOrEqual(1);
  });
});
