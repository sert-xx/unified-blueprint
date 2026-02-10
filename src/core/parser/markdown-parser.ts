/**
 * Markdown パーサー (remark/unified パイプライン)
 *
 * Markdownテキストを入力として、Frontmatter, Section配列, WikiLink配列を抽出する。
 * remark-parse + remark-frontmatter で AST を構築し、カスタムプラグインで
 * WikiLink 抽出とセクション分割を行う。
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';

import { parseFrontmatter } from './frontmatter-parser.js';
import { remarkWikiLink, assignSectionOrders } from './wikilink-extractor.js';
import { remarkMarkdownLink } from './mdlink-extractor.js';
import { splitSections, type SplitOptions } from './section-splitter.js';
import type { ParseResult, ParsedLink, Frontmatter } from '../../shared/types.js';
import { ParseError } from '../../shared/errors.js';

/**
 * remark/unified パイプラインを構築する。
 */
function createProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkWikiLink)
    .use(remarkMarkdownLink);
}

/**
 * ドキュメントのタイトルを解決する。
 *
 * 優先順位:
 *   1. Frontmatter の title フィールド
 *   2. 最初の H1 見出し
 *   3. ファイル名（拡張子なし）
 */
function resolveTitle(
  frontmatter: Frontmatter,
  tree: Root,
  filepath: string,
): string {
  // 1. Frontmatter title
  if (frontmatter.title) {
    return frontmatter.title;
  }

  // 2. 最初の H1 見出し
  let h1Title: string | undefined;
  visit(tree, 'heading', (node) => {
    if (node.depth === 1 && !h1Title) {
      // 子ノードのテキストを結合
      h1Title = node.children
        .map((child) => {
          if (child.type === 'text') return child.value;
          if ('value' in child) return String(child.value);
          return '';
        })
        .join('');
    }
  });
  if (h1Title) {
    return h1Title.trim();
  }

  // 3. ファイル名（拡張子なし）
  const basename = filepath.split('/').pop() ?? filepath;
  return basename.replace(/\.md$/, '');
}

export interface ParseMarkdownOptions {
  splitOptions?: SplitOptions;
}

/**
 * Markdown テキストをパースし、ParseResult を返す。
 *
 * @param content - Markdownテキスト
 * @param filepath - ファイルパス（エラーメッセージ・タイトル解決に使用）
 * @param options - パースオプション
 * @returns ParseResult (frontmatter, sections, links, title)
 * @throws ParseError - パース失敗時
 */
export function parseMarkdown(
  content: string,
  filepath: string,
  options?: ParseMarkdownOptions,
): ParseResult {
  try {
    const processor = createProcessor();

    // AST 構築（parse のみ。transform は runSync で実行）
    const tree = processor.parse(content);

    // プラグインの実行（WikiLink 抽出など）
    const vfile = { value: content, path: filepath, data: {} as Record<string, unknown>, messages: [] as Array<{ message: string; line?: number; column?: number }>, toString: () => content };
    processor.runSync(tree, vfile);

    // Frontmatter 解析
    let frontmatter: Frontmatter = {};
    visit(tree, 'yaml', (node: { value: string; type: string }) => {
      const result = parseFrontmatter(node.value, filepath);
      frontmatter = result.data;
    });

    // セクション分割
    const sections = splitSections(tree, content, options?.splitOptions);

    // WikiLink + Markdown リンク抽出結果を取得・マージ
    const wikilinks: ParsedLink[] =
      (vfile.data['wikilinks'] as ParsedLink[] | undefined) ?? [];
    const mdlinks: ParsedLink[] =
      (vfile.data['mdlinks'] as ParsedLink[] | undefined) ?? [];

    // WikiLink のターゲットを正規化して Set 化
    const seenTargets = new Set(
      wikilinks.map((l) =>
        l.target.toLowerCase().replace(/\.md$/, '').normalize('NFC'),
      ),
    );

    // Markdown リンクのうち WikiLink と重複しないものだけ追加
    const uniqueMdlinks = mdlinks.filter(
      (l) =>
        !seenTargets.has(
          l.target.toLowerCase().replace(/\.md$/, '').normalize('NFC'),
        ),
    );

    const links = [...wikilinks, ...uniqueMdlinks];

    // リンクの sectionOrder を設定
    assignSectionOrders(links, sections, content);

    // タイトル解決
    const title = resolveTitle(frontmatter, tree, filepath);

    return {
      frontmatter,
      sections,
      links,
      title,
    };
  } catch (err) {
    if (err instanceof ParseError) throw err;
    throw new ParseError(
      String(err instanceof Error ? err.message : err),
      filepath,
      err instanceof Error ? err : undefined,
    );
  }
}
