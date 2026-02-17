/**
 * Integration tests: special characters in document file paths
 *
 * Verifies that UBP correctly discovers, indexes, and retrieves documents
 * whose directory or file names contain Japanese characters, spaces, or parentheses.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { UbpEngine } from '../../src/core/engine.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-specialchar-test-'));
}

function writeDoc(
  docsRoot: string,
  relativePath: string,
  content: string,
): void {
  const fullPath = path.join(docsRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

describe('Special character paths - integration', () => {
  let tmpDir: string;
  let docsDir: string;
  let engine: UbpEngine;

  beforeEach(() => {
    tmpDir = createTempDir();
    docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    engine = new UbpEngine(tmpDir);
  });

  afterEach(async () => {
    await engine.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function initEngine() {
    return engine.initialize({
      docsDir: 'docs',
      include: ['**/*.md'],
      exclude: [],
      skipEmbedding: true,
    });
  }

  // -------------------------------------------------------
  // Japanese directory and file names
  // -------------------------------------------------------

  it('should discover documents in Japanese-named directories', async () => {
    writeDoc(docsDir, '仕様/認証フロー.md', [
      '---',
      'title: 認証フロー設計',
      'doc_type: design',
      '---',
      '',
      '# 認証フロー',
      '',
      'ユーザー認証の基本フローを定義する。',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(1);
    expect(result.sections_created).toBeGreaterThanOrEqual(1);

    const page = engine.getPage({ filepath: '仕様/認証フロー.md' });
    expect(page.title).toBe('認証フロー設計');
    expect(page.doc_type).toBe('design');
  });

  it('should discover documents with deeply nested Japanese paths', async () => {
    writeDoc(docsDir, '設計/バックエンド/データベース設計.md', [
      '---',
      'title: データベース設計',
      'doc_type: spec',
      '---',
      '',
      '# テーブル定義',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(1);

    const page = engine.getPage({
      filepath: '設計/バックエンド/データベース設計.md',
    });
    expect(page.title).toBe('データベース設計');
  });

  // -------------------------------------------------------
  // Spaces in directory and file names
  // -------------------------------------------------------

  it('should discover documents in directories with spaces', async () => {
    writeDoc(docsDir, 'my documents/getting started.md', [
      '---',
      'title: Getting Started',
      'doc_type: guide',
      '---',
      '',
      '# Getting Started',
      '',
      'Welcome to the project.',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(1);

    const page = engine.getPage({
      filepath: 'my documents/getting started.md',
    });
    expect(page.title).toBe('Getting Started');
    expect(page.doc_type).toBe('guide');
  });

  // -------------------------------------------------------
  // Parentheses in directory and file names
  // -------------------------------------------------------

  it('should discover documents in directories with parentheses', async () => {
    writeDoc(docsDir, 'api (v2)/endpoints.md', [
      '---',
      'title: API v2 Endpoints',
      'doc_type: api',
      '---',
      '',
      '# Endpoints',
      '',
      'REST API endpoint definitions.',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(1);

    const page = engine.getPage({ filepath: 'api (v2)/endpoints.md' });
    expect(page.title).toBe('API v2 Endpoints');
    expect(page.doc_type).toBe('api');
  });

  // -------------------------------------------------------
  // Combined special characters
  // -------------------------------------------------------

  it('should discover documents with mixed special characters', async () => {
    writeDoc(docsDir, '設計 (v2)/認証フロー.md', [
      '---',
      'title: 認証フロー v2',
      'doc_type: design',
      '---',
      '',
      '# 認証フロー v2',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(1);

    const page = engine.getPage({
      filepath: '設計 (v2)/認証フロー.md',
    });
    expect(page.title).toBe('認証フロー v2');
  });

  // -------------------------------------------------------
  // Multiple documents with special character paths
  // -------------------------------------------------------

  it('should discover and list multiple documents with various special characters', async () => {
    writeDoc(docsDir, '仕様/概要.md', [
      '---',
      'title: プロジェクト概要',
      'doc_type: spec',
      '---',
      '',
      '# 概要',
    ].join('\n'));

    writeDoc(docsDir, 'guides (draft)/setup guide.md', [
      '---',
      'title: Setup Guide',
      'doc_type: guide',
      '---',
      '',
      '# Setup',
    ].join('\n'));

    writeDoc(docsDir, 'normal/plain.md', [
      '---',
      'title: Plain Document',
      'doc_type: other',
      '---',
      '',
      '# Plain',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(3);

    const pages = engine.listPages({});
    expect(pages.pages).toHaveLength(3);

    const titles = pages.pages.map((p) => p.title).sort();
    expect(titles).toEqual(['Plain Document', 'Setup Guide', 'プロジェクト概要']);
  });

  // -------------------------------------------------------
  // Cross-document links between special character paths
  // -------------------------------------------------------

  it('should resolve wikilinks between documents with special character paths', async () => {
    writeDoc(docsDir, '仕様/認証.md', [
      '---',
      'title: 認証仕様',
      'doc_type: spec',
      '---',
      '',
      '# 認証',
      '',
      '詳細は [[設計書]] を参照。',
    ].join('\n'));

    writeDoc(docsDir, '仕様/設計書.md', [
      '---',
      'title: 設計書',
      'doc_type: design',
      '---',
      '',
      '# 設計書',
    ].join('\n'));

    const result = await initEngine();

    expect(result.documents_found).toBe(2);
    expect(result.links_found).toBeGreaterThanOrEqual(1);

    const authPage = engine.getPage({ filepath: '仕様/認証.md' });
    expect(authPage.outlinks.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------
  // Fulltext search with special character paths
  // -------------------------------------------------------

  it('should return documents with special character paths in fulltext search', async () => {
    writeDoc(docsDir, '仕様/認証フロー.md', [
      '---',
      'title: 認証フロー設計',
      'doc_type: design',
      '---',
      '',
      '# 認証フロー',
      '',
      'OAuthトークンを使った認証の仕組みを説明する。',
    ].join('\n'));

    await initEngine();

    const searchResult = await engine.fulltextSearch({ query: 'OAuth' });
    expect(searchResult.results.length).toBeGreaterThanOrEqual(1);
    expect(searchResult.results[0]!.filepath).toBe('仕様/認証フロー.md');
  });

  // -------------------------------------------------------
  // Reindex with special character paths
  // -------------------------------------------------------

  it('should correctly reindex documents with special character paths', async () => {
    writeDoc(docsDir, '設計 (v2)/認証.md', [
      '---',
      'title: 認証 v2',
      'doc_type: design',
      '---',
      '',
      '# 認証',
    ].join('\n'));

    await initEngine();

    // Modify the document
    writeDoc(docsDir, '設計 (v2)/認証.md', [
      '---',
      'title: 認証 v2 改訂版',
      'doc_type: design',
      '---',
      '',
      '# 認証（改訂版）',
      '',
      '改訂内容を追加。',
    ].join('\n'));

    const reindexResult = await engine.reindex({ skipEmbedding: true });

    expect(reindexResult.documents_processed).toBeGreaterThanOrEqual(1);

    const page = engine.getPage({ filepath: '設計 (v2)/認証.md' });
    expect(page.title).toBe('認証 v2 改訂版');
  });

  // -------------------------------------------------------
  // Confluence-style page.md structure
  // -------------------------------------------------------

  describe('Confluence-style page.md structure', () => {
    it('should use directory hierarchy as title when filename is page.md', async () => {
      // Confluenceエクスポート: タイトルはディレクトリ名、中身はpage.md
      // frontmatter も H1 も無い場合、filepath からタイトルを生成
      writeDoc(docsDir, 'プロジェクト概要/page.md', [
        'このドキュメントはプロジェクトの概要を説明する。',
      ].join('\n'));

      const result = await initEngine();

      expect(result.documents_found).toBe(1);

      const page = engine.getPage({ filepath: 'プロジェクト概要/page.md' });
      expect(page.title).toBe('プロジェクト概要/page');
    });

    it('should give distinct titles to page.md files in different directories', async () => {
      writeDoc(docsDir, 'ルートページ/page.md', 'ルートの内容');
      writeDoc(docsDir, 'ルートページ/子ページA/page.md', '子Aの内容');
      writeDoc(docsDir, 'ルートページ/子ページB/page.md', '子Bの内容');
      writeDoc(docsDir, 'ルートページ/子ページB/孫ページ/page.md', '孫の内容');

      const result = await initEngine();

      expect(result.documents_found).toBe(4);

      const pages = engine.listPages({});
      const titles = pages.pages.map((p) => p.title).sort();
      expect(titles).toEqual([
        'ルートページ/page',
        'ルートページ/子ページA/page',
        'ルートページ/子ページB/page',
        'ルートページ/子ページB/孫ページ/page',
      ]);
    });

    it('should prefer frontmatter title over directory path even for page.md', async () => {
      writeDoc(docsDir, 'ルートページ/page.md', [
        '---',
        'title: カスタムタイトル',
        '---',
        '',
        '明示的にタイトルが指定されたドキュメント。',
      ].join('\n'));

      await initEngine();

      const page = engine.getPage({ filepath: 'ルートページ/page.md' });
      expect(page.title).toBe('カスタムタイトル');
    });

    it('should use filepath as title even when H1 heading exists', async () => {
      writeDoc(docsDir, 'ルートページ/page.md', [
        '# 概要',
        '',
        '本文テキスト。',
      ].join('\n'));

      await initEngine();

      const page = engine.getPage({ filepath: 'ルートページ/page.md' });
      expect(page.title).toBe('ルートページ/page');
    });
  });
});
