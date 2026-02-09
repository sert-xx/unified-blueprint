/**
 * Data Layer 内部型定義
 * SQLite テーブルとの直接的なマッピング型
 */

/** ISO 8601形式の日時文字列 */
export type ISODateString = string;

/** UUID v7形式のID */
export type UUID = string;

/** ドキュメント種別（DDL CHECK制約に対応） */
export type DataDocType =
  | 'spec'
  | 'design'
  | 'db-schema'
  | 'api'
  | 'config'
  | 'guide';

/** リンク種別（DDL CHECK制約に対応） */
export type DataLinkType =
  | 'references'
  | 'depends_on'
  | 'implements'
  | 'extends'
  | 'conflicts_with';

// --- Document ---

export interface DocumentRow {
  id: UUID;
  filepath: string;
  title: string;
  doc_type: DataDocType;
  body_hash: string;
  created_at: ISODateString;
  updated_at: ISODateString;
}

// --- Section ---

export interface SectionRow {
  id: number;
  doc_id: UUID;
  heading: string | null;
  section_order: number;
  content: string;
  content_hash: string;
  embedding: Buffer | null;
  embedding_model: string | null;
  token_count: number | null;
  updated_at: ISODateString;
}

export interface SectionInsert {
  doc_id: UUID;
  heading: string | null;
  section_order: number;
  content: string;
  content_hash: string;
  token_count: number | null;
}

// --- Link ---

export interface LinkRow {
  source_doc_id: UUID;
  target_doc_id: UUID | null;
  type: DataLinkType;
  context: string | null;
  source_section_id: number | null;
  target_title: string | null;
  created_at: ISODateString;
}

export interface LinkInsert {
  source_doc_id: UUID;
  target_doc_id: UUID | null;
  type: DataLinkType;
  context: string | null;
  source_section_id: number | null;
  target_title: string | null;
}

// --- Source Refs State ---

export interface SourceRefsStateRow {
  doc_id: UUID;
  file_path: string;
  last_synced_hash: string | null;
  last_synced_at: ISODateString | null;
  is_stale: number; // 0 or 1 in SQLite
}

// --- Migration ---

export interface Migration {
  version: number;
  description: string;
  up: (db: import('better-sqlite3').Database) => void;
}

// --- Vector ---

export interface VectorEntry {
  sectionId: number;
  docId: string;
  embedding: Float32Array;
}

export interface VectorSearchResult {
  sectionId: number;
  docId: string;
  similarity: number;
}

// --- Graph ---

export interface GraphNode {
  docId: UUID;
  title: string;
  docType: DataDocType;
  depth: number;
  linkType: DataLinkType;
  direction: 'outgoing' | 'incoming';
}

export interface GraphEdge {
  source: UUID;
  target: UUID;
  type: DataLinkType;
}

// --- Fulltext ---

export interface FulltextSearchResult {
  sectionId: number;
  docId: UUID;
  title: string;
  docType: DataDocType;
  heading: string | null;
  snippet: string;
  rank: number;
}
