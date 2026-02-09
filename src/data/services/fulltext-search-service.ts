import type Database from 'better-sqlite3';
import type { FulltextSearchResult } from '../types.js';

export interface FulltextSearchService {
  search(query: string, limit?: number): FulltextSearchResult[];
}

/**
 * FTS5 クエリ用にユーザー入力をサニタイズする。
 * 各トークンをダブルクォートで囲み、FTS5 構文キーワード（AND, OR, NOT, NEAR）や
 * 特殊文字（*, ^, (, ), :, "）が演算子として解釈されることを防ぐ。
 */
function sanitizeFts5Query(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Split into tokens by whitespace, wrap each in double quotes
  // Escape any internal double quotes by doubling them
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  return tokens
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' ');
}

export function createFulltextSearchService(
  db: Database.Database,
): FulltextSearchService {
  return {
    search(query: string, limit: number = 20): FulltextSearchResult[] {
      const sanitized = sanitizeFts5Query(query);
      if (!sanitized) return [];

      const stmt = db.prepare(`
        SELECT
          s.id AS section_id,
          s.doc_id,
          d.title,
          d.doc_type,
          s.heading,
          snippet(sections_fts, 1, '<mark>', '</mark>', '...', 64) AS snippet,
          rank
        FROM sections_fts
        JOIN sections s ON sections_fts.rowid = s.id
        JOIN documents d ON s.doc_id = d.id
        WHERE sections_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      try {
        const rows = stmt.all(sanitized, limit) as Array<{
          section_id: number;
          doc_id: string;
          title: string;
          doc_type: string;
          heading: string | null;
          snippet: string;
          rank: number;
        }>;

        return rows.map((row) => ({
          sectionId: row.section_id,
          docId: row.doc_id,
          title: row.title,
          docType: row.doc_type as FulltextSearchResult['docType'],
          heading: row.heading,
          snippet: row.snippet,
          rank: row.rank,
        }));
      } catch {
        // FTS5 query still failed after sanitization - return empty results
        return [];
      }
    },
  };
}
