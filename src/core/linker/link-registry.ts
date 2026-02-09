/**
 * リンク差分更新（LinkRegistry）
 *
 * パース結果のリンク一覧と既存のリンクレコードを比較し、
 * ドキュメント単位で差分更新を行う。
 * 実際のDB操作は LinkRepository（Data Layer）に委譲する。
 */

import type { ParsedLink, LinkType } from '../../shared/types.js';
import { LinkResolver } from './link-resolver.js';

/**
 * LinkRepository の最小限インターフェース。
 * Data Layer の LinkRepository が将来これを満たす。
 */
export interface LinkStore {
  deleteBySourceDoc(docId: string): void;
  insertLink(link: LinkInsertInput): void;
}

export interface LinkInsertInput {
  source_doc_id: string;
  target_doc_id: string | null;
  type: LinkType;
  context: string | null;
  source_section_id: number | null;
  target_title: string;
}

export interface LinkUpdateResult {
  resolved: number;
  dangling: number;
}

/**
 * ドキュメントのリンクを差分更新する。
 *
 * 現在の実装は「全削除 + 全挿入」方式。
 * ドキュメント単位のリンク数は少ないため（通常10本未満）、差分計算のオーバーヘッドより単純。
 *
 * @param store - リンクの永続化先
 * @param resolver - WikiLink リゾルバー
 * @param docId - リンク元ドキュメントID
 * @param sourceFilepath - リンク元ファイルパス
 * @param links - パーサーが抽出した WikiLink 一覧
 * @param sectionIdMap - sectionOrder -> section DB ID のマップ
 * @returns 解決・未解決リンク数
 */
export function updateDocumentLinks(
  store: LinkStore,
  resolver: LinkResolver,
  docId: string,
  sourceFilepath: string,
  links: ParsedLink[],
  sectionIdMap: Map<number, number>,
): LinkUpdateResult {
  let resolved = 0;
  let dangling = 0;

  // 既存リンクを全削除
  store.deleteBySourceDoc(docId);

  // 新しいリンクを挿入
  for (const link of links) {
    const resolution = resolver.resolve(link.target, sourceFilepath);

    if (resolution.status === 'resolved') {
      resolved++;
    } else {
      dangling++;
    }

    store.insertLink({
      source_doc_id: docId,
      target_doc_id: resolution.targetDocId,
      type: link.type,
      context: link.context || null,
      source_section_id: sectionIdMap.get(link.sectionOrder) ?? null,
      target_title: link.target,
    });
  }

  return { resolved, dangling };
}
