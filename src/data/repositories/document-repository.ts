import type { StatementCache } from '../statement-cache.js';
import type { DocumentRow, DataDocType, UUID } from '../types.js';

export interface DocumentRepository {
  findById(id: UUID): DocumentRow | null;
  findByFilepath(filepath: string): DocumentRow | null;
  findByTitle(title: string): DocumentRow[];
  findAll(options?: {
    sortBy?: 'title' | 'updated_at' | 'created_at';
    order?: 'asc' | 'desc';
    docType?: DataDocType;
  }): DocumentRow[];
  upsert(
    doc: Omit<DocumentRow, 'created_at' | 'updated_at'>,
  ): { changed: boolean };
  deleteById(id: UUID): void;
  deleteNotIn(filepaths: string[]): UUID[];
}

export function createDocumentRepository(
  cache: StatementCache,
): DocumentRepository {
  return {
    findById(id: UUID): DocumentRow | null {
      const stmt = cache.get(
        'select_document_by_id',
        'SELECT * FROM documents WHERE id = ?',
      );
      return (stmt.get(id) as DocumentRow | undefined) ?? null;
    },

    findByFilepath(filepath: string): DocumentRow | null {
      const stmt = cache.get(
        'select_document_by_filepath',
        'SELECT * FROM documents WHERE filepath = ?',
      );
      return (stmt.get(filepath) as DocumentRow | undefined) ?? null;
    },

    findByTitle(title: string): DocumentRow[] {
      const stmt = cache.get(
        'select_documents_by_title',
        'SELECT * FROM documents WHERE title LIKE ?',
      );
      return stmt.all(`%${title}%`) as DocumentRow[];
    },

    findAll(options?: {
      sortBy?: 'title' | 'updated_at' | 'created_at';
      order?: 'asc' | 'desc';
      docType?: DataDocType;
    }): DocumentRow[] {
      const sortBy = options?.sortBy ?? 'title';
      const order = options?.order ?? 'asc';
      const docType = options?.docType;

      // Build query dynamically based on options.
      // Safe from injection since sortBy and order are validated enum values.
      const validSortColumns = ['title', 'updated_at', 'created_at'] as const;
      const validOrders = ['asc', 'desc'] as const;
      const sortCol = validSortColumns.includes(
        sortBy as (typeof validSortColumns)[number],
      )
        ? sortBy
        : 'title';
      const sortOrder = validOrders.includes(
        order as (typeof validOrders)[number],
      )
        ? order
        : 'asc';

      if (docType) {
        const key = `select_all_documents_${sortCol}_${sortOrder}_filtered`;
        const stmt = cache.get(
          key,
          `SELECT * FROM documents WHERE doc_type = ? ORDER BY ${sortCol} ${sortOrder}`,
        );
        return stmt.all(docType) as DocumentRow[];
      }

      const key = `select_all_documents_${sortCol}_${sortOrder}`;
      const stmt = cache.get(
        key,
        `SELECT * FROM documents ORDER BY ${sortCol} ${sortOrder}`,
      );
      return stmt.all() as DocumentRow[];
    },

    upsert(
      doc: Omit<DocumentRow, 'created_at' | 'updated_at'>,
    ): { changed: boolean } {
      const now = new Date().toISOString();

      // Check if document exists and has the same body_hash
      const existing = this.findById(doc.id);
      if (existing && existing.body_hash === doc.body_hash) {
        return { changed: false };
      }

      const stmt = cache.get(
        'upsert_document',
        `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           filepath = excluded.filepath,
           title = excluded.title,
           doc_type = excluded.doc_type,
           body_hash = excluded.body_hash,
           updated_at = excluded.updated_at`,
      );
      stmt.run(
        doc.id,
        doc.filepath,
        doc.title,
        doc.doc_type,
        doc.body_hash,
        existing?.created_at ?? now,
        now,
      );

      return { changed: true };
    },

    deleteById(id: UUID): void {
      const stmt = cache.get(
        'delete_document_by_id',
        'DELETE FROM documents WHERE id = ?',
      );
      stmt.run(id);
    },

    deleteNotIn(filepaths: string[]): UUID[] {
      if (filepaths.length === 0) {
        // Delete all and return their IDs
        const allDocs = cache
          .get('select_all_document_ids', 'SELECT id FROM documents')
          .all() as Array<{ id: string }>;
        const ids = allDocs.map((d) => d.id);
        cache
          .get('delete_all_documents', 'DELETE FROM documents')
          .run();
        return ids;
      }

      const placeholders = filepaths.map(() => '?').join(',');
      // Cannot cache this since placeholder count varies
      const selectStmt = cache.get(
        `select_docs_not_in_${filepaths.length}`,
        `SELECT id FROM documents WHERE filepath NOT IN (${placeholders})`,
      );
      const rows = selectStmt.all(...filepaths) as Array<{ id: string }>;
      const ids = rows.map((r) => r.id);

      if (ids.length > 0) {
        const deleteStmt = cache.get(
          `delete_docs_not_in_${filepaths.length}`,
          `DELETE FROM documents WHERE filepath NOT IN (${placeholders})`,
        );
        deleteStmt.run(...filepaths);
      }

      return ids;
    },
  };
}
