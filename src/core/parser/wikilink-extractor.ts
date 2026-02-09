/**
 * WikiLink 抽出 remark プラグイン
 *
 * Markdown AST の text ノードから [[Target]] と [[Target|type]] パターンを検出し、
 * ParsedLink オブジェクトとして抽出する。コードブロック内のWikiLinkは無視する。
 */

import type { Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit, SKIP } from 'unist-util-visit';
import type { LinkType, ParsedLink } from '../../shared/types.js';

/**
 * WikiLink パターン:
 *   [[ページ名]]             -> target: "ページ名", type: "references"
 *   [[ページ名|depends_on]]  -> target: "ページ名", type: "depends_on"
 *   [[パス/ページ名]]         -> target: "パス/ページ名", type: "references"
 */
const WIKILINK_PATTERN = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;

const VALID_LINK_TYPES: ReadonlySet<string> = new Set<string>([
  'references',
  'depends_on',
  'implements',
  'extends',
  'conflicts_with',
]);

export interface ExtractedWikiLinks {
  links: ParsedLink[];
  warnings: WikiLinkWarning[];
}

export interface WikiLinkWarning {
  type: 'invalid_link_type';
  message: string;
  line?: number;
  column?: number;
}

/**
 * remark プラグイン: text ノードから WikiLink を抽出し、
 * vfile.data.wikilinks に格納する。
 */
export const remarkWikiLink: Plugin<[], Root> = function () {
  return (tree: Root, file) => {
    const links: ParsedLink[] = [];
    const warnings: WikiLinkWarning[] = [];
    const sourceText = String(file);

    visit(tree, 'text', (node: Text, _index, parent) => {
      // コードブロック内・インラインコード内は無視
      const parentType = parent?.type as string | undefined;
      if (parentType === 'code' || parentType === 'inlineCode') {
        return SKIP;
      }

      WIKILINK_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = WIKILINK_PATTERN.exec(node.value)) !== null) {
        const target = match[1]!.trim();
        const rawLabel = match[2]?.trim();

        if (!target) continue;

        // リンクタイプの決定
        let linkType: LinkType = 'references';
        if (rawLabel) {
          if (VALID_LINK_TYPES.has(rawLabel)) {
            linkType = rawLabel as LinkType;
          } else {
            warnings.push({
              type: 'invalid_link_type',
              message:
                `Invalid link type "${rawLabel}" in [[${target}|${rawLabel}]]. ` +
                `Falling back to "references". Valid types: ${[...VALID_LINK_TYPES].join(', ')}`,
              line: node.position?.start.line,
              column: node.position
                ? node.position.start.column + match.index
                : undefined,
            });
          }
        }

        // コンテキスト抽出（前後50文字）
        const absoluteOffset =
          (node.position?.start.offset ?? 0) + match.index;
        const contextStart = Math.max(0, absoluteOffset - 50);
        const contextEnd = Math.min(
          sourceText.length,
          absoluteOffset + match[0].length + 50,
        );
        const context = sourceText.slice(contextStart, contextEnd);

        links.push({
          target,
          type: linkType,
          context,
          sectionOrder: 0, // section-splitter が後で設定する
        });
      }
    });

    // vfile.data にWikiLink一覧と警告を格納
    file.data['wikilinks'] = links;
    file.data['wikilinkWarnings'] = warnings;
  };
};

/**
 * WikiLink の sectionOrder を、セクション分割結果をもとに設定する。
 * content 中のWikiLinkの出現位置とセクションの範囲を照合する。
 */
export function assignSectionOrders(
  links: ParsedLink[],
  sectionContents: Array<{ content: string; order: number }>,
  fullContent: string,
): void {
  for (const link of links) {
    // context から元の WikiLink パターンを復元して位置を推定
    const linkPattern = `[[${link.target}`;
    const linkOffset = fullContent.indexOf(linkPattern);
    if (linkOffset === -1) {
      // 位置不明の場合は最初のセクション
      link.sectionOrder = 0;
      continue;
    }

    // 各セクションの content が fullContent 中のどこにあるかで照合
    let cumulativeOffset = 0;
    let assigned = false;
    for (const section of sectionContents) {
      const sectionStart = fullContent.indexOf(
        section.content.slice(0, Math.min(40, section.content.length)),
        cumulativeOffset,
      );
      if (sectionStart === -1) continue;
      const sectionEnd = sectionStart + section.content.length;
      cumulativeOffset = sectionEnd;

      if (linkOffset >= sectionStart && linkOffset < sectionEnd) {
        link.sectionOrder = section.order;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      link.sectionOrder = 0;
    }
  }
}
