/**
 * 通常Markdownリンク抽出 remark プラグイン
 *
 * Markdown AST の link ノードを走査して内部 .md リンクを抽出し、
 * ParsedLink オブジェクト (type: "references") として格納する。
 */

import * as path from 'node:path';
import type { Root, Link } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import { toString } from 'mdast-util-to-string';
import type { ParsedLink } from '../../shared/types.js';

/**
 * 外部URLやアンカーのみのリンクを除外する判定
 */
function isExternalOrNonMd(url: string): boolean {
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('mailto:')
  ) {
    return true;
  }
  // アンカーのみ
  if (url.startsWith('#')) {
    return true;
  }
  return false;
}

/**
 * remark プラグイン: link ノードから内部 Markdown リンクを抽出し、
 * vfile.data.mdlinks に格納する。
 *
 * filepath オプションでソースファイルのパスを指定する。
 * 指定がない場合は vfile.path を使用する。
 */
export const remarkMarkdownLink: Plugin<[], Root> = function () {
  return (tree: Root, file) => {
    const links: ParsedLink[] = [];
    const sourceText = String(file);
    const sourceFilepath = (file as { path?: string }).path ?? '';
    const sourceDir = path.posix.dirname(sourceFilepath);

    visit(tree, 'link', (node: Link) => {
      const url = node.url;

      // 外部URL、アンカーのみをスキップ
      if (isExternalOrNonMd(url)) return;

      // アンカーフラグメントとクエリ文字列を除去
      let cleanUrl = url.split('#')[0]!.split('?')[0]!;

      // URLエンコードを解除
      try {
        cleanUrl = decodeURIComponent(cleanUrl);
      } catch {
        // デコード失敗時はそのまま使用
      }

      // .md ファイルのみ対象
      if (!cleanUrl.endsWith('.md')) return;

      // docs-relative パスに解決
      const resolved = path.posix.normalize(
        path.posix.join(sourceDir, cleanUrl),
      );

      // パストラバーサル防止
      if (resolved.startsWith('..')) return;

      // .md 拡張子を除去してターゲット文字列を生成
      const target = resolved.replace(/\.md$/, '');

      // コンテキスト抽出（前後50文字）
      const nodeText = toString(node);
      const originalPattern = `](${url})`;
      const absoluteOffset =
        node.position?.start.offset ?? sourceText.indexOf(originalPattern);
      const contextStart = Math.max(0, absoluteOffset - 50);
      const contextEnd = Math.min(
        sourceText.length,
        absoluteOffset + nodeText.length + url.length + 4 + 50, // [text](url) = text + url + []()
      );
      const context = sourceText.slice(contextStart, contextEnd);

      links.push({
        target,
        type: 'references',
        context,
        sectionOrder: 0,
        _searchPattern: `](${url})`,
      });
    });

    file.data['mdlinks'] = links;
  };
};
