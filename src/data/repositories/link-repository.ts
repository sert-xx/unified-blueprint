import type { StatementCache } from '../statement-cache.js';
import type { LinkRow, LinkInsert, UUID } from '../types.js';

export interface LinkRepository {
  findBySourceDocId(sourceDocId: UUID): LinkRow[];
  findByTargetDocId(targetDocId: UUID): LinkRow[];
  replaceBySourceDocId(sourceDocId: UUID, links: LinkInsert[]): void;
  findDangling(): LinkRow[];
  resolveDangling(targetTitle: string, targetDocId: UUID): number;
  count(): { total: number; resolved: number; dangling: number };
}

export function createLinkRepository(cache: StatementCache): LinkRepository {
  return {
    findBySourceDocId(sourceDocId: UUID): LinkRow[] {
      const stmt = cache.get(
        'select_links_by_source',
        'SELECT * FROM links WHERE source_doc_id = ?',
      );
      return stmt.all(sourceDocId) as LinkRow[];
    },

    findByTargetDocId(targetDocId: UUID): LinkRow[] {
      const stmt = cache.get(
        'select_links_by_target',
        'SELECT * FROM links WHERE target_doc_id = ?',
      );
      return stmt.all(targetDocId) as LinkRow[];
    },

    replaceBySourceDocId(sourceDocId: UUID, links: LinkInsert[]): void {
      const deleteStmt = cache.get(
        'delete_links_by_source',
        'DELETE FROM links WHERE source_doc_id = ?',
      );
      deleteStmt.run(sourceDocId);

      const insertStmt = cache.get(
        'insert_link',
        `INSERT OR IGNORE INTO links (source_doc_id, target_doc_id, type, context, source_section_id, target_title, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      const now = new Date().toISOString();
      for (const link of links) {
        insertStmt.run(
          link.source_doc_id,
          link.target_doc_id,
          link.type,
          link.context,
          link.source_section_id,
          link.target_title,
          now,
        );
      }
    },

    findDangling(): LinkRow[] {
      const stmt = cache.get(
        'select_dangling_links',
        'SELECT * FROM links WHERE target_doc_id IS NULL',
      );
      return stmt.all() as LinkRow[];
    },

    resolveDangling(targetTitle: string, targetDocId: UUID): number {
      const stmt = cache.get(
        'resolve_dangling_links',
        `UPDATE links SET target_doc_id = ?
         WHERE target_doc_id IS NULL AND target_title = ?`,
      );
      const result = stmt.run(targetDocId, targetTitle);
      return result.changes;
    },

    count(): { total: number; resolved: number; dangling: number } {
      const totalStmt = cache.get(
        'count_links_total',
        'SELECT COUNT(*) AS cnt FROM links',
      );
      const resolvedStmt = cache.get(
        'count_links_resolved',
        'SELECT COUNT(*) AS cnt FROM links WHERE target_doc_id IS NOT NULL',
      );
      const danglingStmt = cache.get(
        'count_links_dangling',
        'SELECT COUNT(*) AS cnt FROM links WHERE target_doc_id IS NULL',
      );

      const total = (totalStmt.get() as { cnt: number }).cnt;
      const resolved = (resolvedStmt.get() as { cnt: number }).cnt;
      const dangling = (danglingStmt.get() as { cnt: number }).cnt;

      return { total, resolved, dangling };
    },
  };
}
