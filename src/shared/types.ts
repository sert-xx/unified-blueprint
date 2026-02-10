/**
 * UBP 共有型定義
 * 全レイヤーで使用される基本型
 */

// --- Document ---

export type DocType =
  | 'spec'
  | 'design'
  | 'adr'
  | 'guide'
  | 'api'
  | 'meeting'
  | 'todo'
  | 'other';

export interface Document {
  id: string;
  filepath: string;
  title: string;
  doc_type: DocType;
  body_hash: string;
  created_at: string;
  updated_at: string;
}

// --- Section ---

export interface Section {
  id: number;
  doc_id: string;
  heading: string | null;
  content: string;
  content_hash: string;
  section_order: number;
  embedding: Float32Array | null;
  embedding_model: string | null;
}

// --- Link ---

export type LinkType =
  | 'references'
  | 'depends_on'
  | 'implements'
  | 'extends'
  | 'conflicts_with';

export interface Link {
  source_doc_id: string;
  target_doc_id: string | null;
  target_title: string;
  type: LinkType;
  context: string | null;
  source_section_id: number | null;
  created_at: string;
}

// --- Source Refs ---

export type StalenessLevel = 'fresh' | 'possibly_stale' | 'stale' | 'untracked';

export interface SourceRefState {
  doc_id: string;
  source_path: string;
  last_known_hash: string;
  checked_at: string;
}

// --- Frontmatter ---

export interface Frontmatter {
  title?: string;
  doc_type?: DocType;
  source_refs?: string[];
}

// --- Parse Results ---

export interface ParsedSection {
  heading: string | null;
  content: string;
  order: number;
}

export interface ParsedLink {
  target: string;
  type: LinkType;
  context: string;
  sectionOrder: number;
  /** assignSectionOrders用の検索パターン（内部利用のみ） */
  _searchPattern?: string;
}

export interface ParseResult {
  frontmatter: Frontmatter;
  sections: ParsedSection[];
  links: ParsedLink[];
  title: string;
}

// --- Search ---

export interface SearchInput {
  query: string;
  limit?: number;
  doc_type?: DocType;
  include_linked?: boolean;
  depth?: number;
  link_types?: LinkType[];
}

export interface SearchOutput {
  results: SearchResult[];
  total_found: number;
  search_type: 'hybrid' | 'fulltext_fallback';
}

export interface SearchResult {
  doc_id: string;
  filepath: string;
  title: string;
  sections: SectionMatch[];
  score: number;
  score_breakdown: {
    vector_similarity: number;
    graph_proximity: number;
  };
  relevance_reason: string;
  staleness: StalenessLevel;
  linked_pages?: LinkedPageSummary[];
}

export interface SectionMatch {
  section_id: number;
  heading: string | null;
  content: string;
  score: number;
}

export interface LinkedPageSummary {
  doc_id: string;
  filepath: string;
  title: string;
  link_type: LinkType;
  summary: string;
}

// --- Fulltext Search ---

export interface FulltextSearchInput {
  query: string;
  limit?: number;
  doc_type?: DocType;
}

export interface FulltextSearchOutput {
  results: FulltextResult[];
  total_found: number;
}

export interface FulltextResult {
  doc_id: string;
  filepath: string;
  title: string;
  section_heading: string | null;
  snippet: string;
  rank: number;
}

// --- Page ---

export interface GetPageInput {
  filepath: string;
}

export interface GetPageOutput {
  doc_id: string;
  filepath: string;
  title: string;
  doc_type: DocType;
  content: string;
  sections: { heading: string | null; content: string }[];
  outlinks: LinkInfo[];
  backlinks: LinkInfo[];
  staleness: StalenessLevel;
  stale_refs: string[];
  updated_at: string;
}

export interface LinkInfo {
  doc_id: string;
  filepath: string;
  title: string;
  link_type: LinkType;
}

// --- Context ---

export interface GetContextInput {
  filepath: string;
  depth?: number;
  max_size?: number;
}

export interface GetContextOutput {
  center: {
    doc_id: string;
    filepath: string;
    title: string;
    content: string;
  };
  related: RelatedDoc[];
  total_size: number;
  truncated_count: number;
}

export interface RelatedDoc {
  doc_id: string;
  filepath: string;
  title: string;
  link_type: LinkType;
  direction: 'outlink' | 'backlink';
  summary: string;
  depth: number;
}

// --- List Pages ---

export interface ListPagesInput {
  doc_type?: DocType;
  sort?: 'title' | 'updated_at' | 'filepath';
  order?: 'asc' | 'desc';
}

export interface ListPagesOutput {
  pages: PageSummary[];
  total: number;
}

export interface PageSummary {
  doc_id: string;
  filepath: string;
  title: string;
  doc_type: DocType;
  link_count: number;
  updated_at: string;
}

// --- Graph ---

export interface GetGraphInput {
  center?: string;
  depth?: number;
}

export interface GetGraphOutput {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphNode {
  id: string;
  filepath: string;
  title: string;
  doc_type: DocType;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: LinkType;
}

// --- Status ---

export interface StatusOutput {
  initialized: boolean;
  docs_dir: string;
  total_documents: number;
  total_sections: number;
  total_links: number;
  resolved_links: number;
  unresolved_links: number;
  embedding_progress: {
    completed: number;
    total: number;
    model: string;
  };
  stale_documents: number;
  db_size_bytes: number;
}

// --- Stale ---

export interface StaleOptions {
  threshold_days?: number;
}

export interface StaleOutput {
  stale_documents: StaleDocInfo[];
  total: number;
}

export interface StaleDocInfo {
  doc_id: string;
  filepath: string;
  title: string;
  staleness: StalenessLevel;
  stale_refs: StaleRefInfo[];
}

export interface StaleRefInfo {
  source_path: string;
  reason: 'modified' | 'deleted' | 'not_found';
}

// --- Suggest Links ---

export interface SuggestLinksOptions {
  threshold?: number;
  limit?: number;
}

export interface SuggestLinksOutput {
  suggestions: LinkSuggestion[];
  total: number;
}

export interface LinkSuggestion {
  source_filepath: string;
  target_filepath: string;
  similarity: number;
  source_section: string;
  target_section: string;
}

// --- Init / Reindex ---

export interface InitResult {
  docs_dir: string;
  documents_found: number;
  sections_created: number;
  links_found: number;
  unresolved_links: number;
}

export interface ReindexOptions {
  force?: boolean;
}

export interface ReindexResult {
  documents_processed: number;
  sections_updated: number;
  links_updated: number;
  embeddings_queued: number;
}

// --- File Change Event ---

export interface FileChangeEvent {
  type: 'add' | 'change' | 'unlink';
  filepath: string;
}
