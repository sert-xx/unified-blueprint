import type { StatementCache } from '../statement-cache.js';
import type { SectionRow, SectionInsert, UUID } from '../types.js';

export interface SectionRepository {
  findByDocId(docId: UUID): SectionRow[];
  findById(id: number): SectionRow | null;
  findPendingEmbeddings(
    limit?: number,
  ): Array<Pick<SectionRow, 'id' | 'doc_id' | 'content'>>;
  findByEmbeddingModelNot(
    model: string,
    limit?: number,
  ): Array<Pick<SectionRow, 'id' | 'doc_id' | 'content'>>;
  replaceByDocId(docId: UUID, sections: SectionInsert[]): void;
  updateEmbedding(id: number, embedding: Buffer, model: string): void;
  count(): number;
  countWithEmbedding(): number;
}

export function createSectionRepository(
  cache: StatementCache,
): SectionRepository {
  return {
    findByDocId(docId: UUID): SectionRow[] {
      const stmt = cache.get(
        'select_sections_by_doc',
        'SELECT * FROM sections WHERE doc_id = ? ORDER BY section_order ASC',
      );
      return stmt.all(docId) as SectionRow[];
    },

    findById(id: number): SectionRow | null {
      const stmt = cache.get(
        'select_section_by_id',
        'SELECT * FROM sections WHERE id = ?',
      );
      return (stmt.get(id) as SectionRow | undefined) ?? null;
    },

    findPendingEmbeddings(
      limit: number = 100,
    ): Array<Pick<SectionRow, 'id' | 'doc_id' | 'content'>> {
      const stmt = cache.get(
        'select_pending_embeddings',
        'SELECT id, doc_id, content FROM sections WHERE embedding IS NULL LIMIT ?',
      );
      return stmt.all(limit) as Array<
        Pick<SectionRow, 'id' | 'doc_id' | 'content'>
      >;
    },

    findByEmbeddingModelNot(
      model: string,
      limit: number = 100,
    ): Array<Pick<SectionRow, 'id' | 'doc_id' | 'content'>> {
      const stmt = cache.get(
        'select_sections_model_not',
        `SELECT id, doc_id, content FROM sections
         WHERE embedding IS NOT NULL AND embedding_model != ?
         LIMIT ?`,
      );
      return stmt.all(model, limit) as Array<
        Pick<SectionRow, 'id' | 'doc_id' | 'content'>
      >;
    },

    replaceByDocId(docId: UUID, sections: SectionInsert[]): void {
      const now = new Date().toISOString();

      // Fetch existing sections to compare content_hash
      const existing = this.findByDocId(docId);
      const existingByOrder = new Map<number, SectionRow>();
      for (const sec of existing) {
        existingByOrder.set(sec.section_order, sec);
      }

      const newOrders = new Set(sections.map((s) => s.section_order));

      // Delete sections that no longer exist
      const deleteStmt = cache.get(
        'delete_section_by_id',
        'DELETE FROM sections WHERE id = ?',
      );
      for (const sec of existing) {
        if (!newOrders.has(sec.section_order)) {
          deleteStmt.run(sec.id);
        }
      }

      const insertStmt = cache.get(
        'insert_section',
        `INSERT INTO sections (doc_id, heading, section_order, content, content_hash, token_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      const updateStmt = cache.get(
        'update_section_content',
        `UPDATE sections SET heading = ?, content = ?, content_hash = ?, token_count = ?, updated_at = ?
         WHERE id = ?`,
      );

      for (const section of sections) {
        const prev = existingByOrder.get(section.section_order);

        if (!prev) {
          // New section - insert
          insertStmt.run(
            section.doc_id,
            section.heading,
            section.section_order,
            section.content,
            section.content_hash,
            section.token_count,
            now,
          );
        } else if (prev.content_hash !== section.content_hash) {
          // Content changed - update (preserves id, embedding cleared by trigger or queue)
          updateStmt.run(
            section.heading,
            section.content,
            section.content_hash,
            section.token_count,
            now,
            prev.id,
          );
        }
        // If content_hash matches, skip - preserves existing embedding
      }
    },

    updateEmbedding(id: number, embedding: Buffer, model: string): void {
      const stmt = cache.get(
        'update_embedding',
        'UPDATE sections SET embedding = ?, embedding_model = ?, updated_at = ? WHERE id = ?',
      );
      stmt.run(embedding, model, new Date().toISOString(), id);
    },

    count(): number {
      const stmt = cache.get(
        'count_sections',
        'SELECT COUNT(*) AS cnt FROM sections',
      );
      const row = stmt.get() as { cnt: number };
      return row.cnt;
    },

    countWithEmbedding(): number {
      const stmt = cache.get(
        'count_sections_with_embedding',
        'SELECT COUNT(*) AS cnt FROM sections WHERE embedding IS NOT NULL',
      );
      const row = stmt.get() as { cnt: number };
      return row.cnt;
    },
  };
}
