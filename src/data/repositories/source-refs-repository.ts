import type { StatementCache } from '../statement-cache.js';
import type { SourceRefsStateRow, UUID } from '../types.js';

export interface SourceRefsStateRepository {
  findByDocId(docId: UUID): SourceRefsStateRow[];
  findStale(): Array<
    SourceRefsStateRow & { doc_title: string; doc_filepath: string }
  >;
  syncByDocId(
    docId: UUID,
    refs: Array<{ filePath: string; hash: string }>,
  ): void;
  updateStaleness(filePath: string, currentHash: string): void;
  summary(): {
    fresh: number;
    stale: number;
    total: number;
  };
}

export function createSourceRefsStateRepository(
  cache: StatementCache,
): SourceRefsStateRepository {
  return {
    findByDocId(docId: UUID): SourceRefsStateRow[] {
      const stmt = cache.get(
        'select_source_refs_by_doc',
        'SELECT * FROM source_refs_state WHERE doc_id = ?',
      );
      return stmt.all(docId) as SourceRefsStateRow[];
    },

    findStale(): Array<
      SourceRefsStateRow & { doc_title: string; doc_filepath: string }
    > {
      const stmt = cache.get(
        'select_stale_source_refs',
        `SELECT s.*, d.title AS doc_title, d.filepath AS doc_filepath
         FROM source_refs_state s
         JOIN documents d ON s.doc_id = d.id
         WHERE s.is_stale = 1`,
      );
      return stmt.all() as Array<
        SourceRefsStateRow & { doc_title: string; doc_filepath: string }
      >;
    },

    syncByDocId(
      docId: UUID,
      refs: Array<{ filePath: string; hash: string }>,
    ): void {
      const deleteStmt = cache.get(
        'delete_source_refs_by_doc',
        'DELETE FROM source_refs_state WHERE doc_id = ?',
      );
      deleteStmt.run(docId);

      if (refs.length === 0) return;

      const insertStmt = cache.get(
        'insert_source_ref',
        `INSERT INTO source_refs_state (doc_id, file_path, last_synced_hash, last_synced_at, is_stale)
         VALUES (?, ?, ?, ?, 0)`,
      );

      const now = new Date().toISOString();
      for (const ref of refs) {
        insertStmt.run(docId, ref.filePath, ref.hash, now);
      }
    },

    updateStaleness(filePath: string, currentHash: string): void {
      const stmt = cache.get(
        'update_staleness',
        `UPDATE source_refs_state
         SET is_stale = CASE WHEN last_synced_hash != ? THEN 1 ELSE 0 END
         WHERE file_path = ?`,
      );
      stmt.run(currentHash, filePath);
    },

    summary(): { fresh: number; stale: number; total: number } {
      const stmt = cache.get(
        'source_refs_summary',
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN is_stale = 0 THEN 1 ELSE 0 END) AS fresh,
           SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) AS stale
         FROM source_refs_state`,
      );
      const row = stmt.get() as {
        total: number;
        fresh: number;
        stale: number;
      };
      return {
        total: row.total,
        fresh: row.fresh ?? 0,
        stale: row.stale ?? 0,
      };
    },
  };
}
