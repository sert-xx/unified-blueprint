/**
 * 見出しベースセクション分割
 *
 * Markdown AST を H2/H3 の見出しで分割し、セクション配列を生成する。
 * 要求定義 v3 セクション 6.2 のチャンク戦略に準拠:
 *   1. H2, H3 を分割境界とする
 *   2. ファイル先頭から H2 到達前は section_order=0, heading=null
 *   3. H1 はタイトル扱い。分割境界にしない
 *   4. H4 以下は親セクションに含める
 *   5. 256トークン超のセクションは段落境界でサブ分割
 *   6. 32トークン未満のセクションは前のセクションに結合
 */

import type { Root, Heading, Content } from 'mdast';
import { toString } from 'mdast-util-to-string';
import type { ParsedSection } from '../../shared/types.js';

const DEFAULT_MAX_TOKENS = 256;
const DEFAULT_MIN_TOKENS = 32;

export interface SplitOptions {
  maxTokens?: number;
  minTokens?: number;
}

/**
 * トークン数の推定（簡易版）
 * 日本語は文字数ベース、英語は単語数ベースで概算する。
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  // 日本語（CJK統合漢字 + ひらがな + カタカナ）文字数
  const japaneseChars = (
    text.match(/[\u3000-\u9fff\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]/g) ||
    []
  ).length;
  // 英語単語数（日本語文字を除外してからカウント）
  const englishWords = text
    .replace(/[\u3000-\u9fff\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  // 日本語: 1文字 ~ 1.5トークン, 英語: 1単語 ~ 1.3トークン
  return Math.ceil(japaneseChars * 1.5 + englishWords * 1.3);
}

/**
 * AST ノードをMarkdownテキストにシリアライズする。
 * ソーステキストから該当範囲を切り出す。位置情報がない場合は toString で近似。
 */
function serializeNode(node: Content, sourceText: string): string {
  if (node.position) {
    return sourceText.slice(
      node.position.start.offset,
      node.position.end.offset,
    );
  }
  return toString(node);
}

interface RawSection {
  heading: string | null;
  content: string;
  order: number;
  estimatedTokens: number;
}

/**
 * Markdown AST をセクション配列に分割する。
 */
export function splitSections(
  tree: Root,
  sourceText: string,
  options?: SplitOptions,
): ParsedSection[] {
  const maxTokens = options?.maxTokens ?? DEFAULT_MAX_TOKENS;
  const minTokens = options?.minTokens ?? DEFAULT_MIN_TOKENS;

  const rawSections: RawSection[] = [];
  let currentHeading: string | null = null;
  let currentContent: string[] = [];
  let sectionOrder = 0;

  for (const node of tree.children) {
    // Frontmatter YAML ノードはスキップ
    if (node.type === 'yaml') {
      continue;
    }

    if (node.type === 'heading') {
      const heading = node as Heading;
      const depth = heading.depth;

      // H1 はタイトル扱い。分割境界にしない
      if (depth === 1) {
        currentContent.push(toString(heading));
        continue;
      }

      // H2, H3 は分割境界
      if (depth === 2 || depth === 3) {
        // 現在蓄積中のセクションを確定
        if (currentContent.length > 0 || currentHeading !== null) {
          const content = currentContent.join('\n\n');
          rawSections.push({
            heading: currentHeading,
            content,
            order: sectionOrder++,
            estimatedTokens: estimateTokens(content),
          });
        }

        currentHeading = toString(heading);
        currentContent = [];
        continue;
      }

      // H4 以下は分割境界にしない（コンテンツとして含める）
      currentContent.push(serializeNode(node, sourceText));
      continue;
    }

    // 通常コンテンツ
    currentContent.push(serializeNode(node, sourceText));
  }

  // 最後のセクションを確定
  if (currentContent.length > 0 || currentHeading !== null) {
    const content = currentContent.join('\n\n');
    rawSections.push({
      heading: currentHeading,
      content,
      order: sectionOrder,
      estimatedTokens: estimateTokens(content),
    });
  }

  // 空のドキュメントの場合は空セクションを1つ返す
  if (rawSections.length === 0) {
    return [{ heading: null, content: '', order: 0 }];
  }

  return postProcessSections(rawSections, maxTokens, minTokens);
}

/**
 * 大きすぎるセクションを段落境界で分割し、小さすぎるセクションを結合する。
 */
function postProcessSections(
  sections: RawSection[],
  maxTokens: number,
  minTokens: number,
): ParsedSection[] {
  // Phase 1: サブ分割
  const expanded: RawSection[] = [];
  for (const section of sections) {
    if (section.estimatedTokens > maxTokens) {
      expanded.push(...splitByParagraph(section, maxTokens));
    } else {
      expanded.push(section);
    }
  }

  // Phase 2: 結合
  const merged = mergeTinySections(expanded, minTokens);

  // order を振り直して ParsedSection に変換
  return merged.map((s, i) => ({
    heading: s.heading,
    content: s.content,
    order: i,
  }));
}

/**
 * 段落境界での分割。
 */
function splitByParagraph(
  section: RawSection,
  maxTokens: number,
): RawSection[] {
  const paragraphs = section.content.split(/\n\n+/);
  const subSections: RawSection[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;
  let subOrder = 0;

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > maxTokens && currentChunk.length > 0) {
      const content = currentChunk.join('\n\n');
      subSections.push({
        heading: section.heading,
        content,
        order: section.order,
        estimatedTokens: currentTokens,
      });
      currentChunk = [];
      currentTokens = 0;
      subOrder++;
    }

    currentChunk.push(para);
    currentTokens += paraTokens;
  }

  if (currentChunk.length > 0) {
    const content = currentChunk.join('\n\n');
    subSections.push({
      heading: subOrder === 0 ? section.heading : section.heading,
      content,
      order: section.order,
      estimatedTokens: currentTokens,
    });
  }

  return subSections;
}

/**
 * 32トークン未満のセクションを前のセクションに結合する。
 */
function mergeTinySections(
  sections: RawSection[],
  minTokens: number,
): RawSection[] {
  if (sections.length <= 1) return sections;

  const result: RawSection[] = [sections[0]!];

  for (let i = 1; i < sections.length; i++) {
    const current = sections[i]!;

    if (current.estimatedTokens < minTokens) {
      const prev = result[result.length - 1]!;
      prev.content = prev.content + '\n\n' + current.content;
      prev.estimatedTokens += current.estimatedTokens;
    } else {
      result.push(current);
    }
  }

  return result;
}
