import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from './index.js';

describe('Migrations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
  });

  it('should create all tables on fresh database', () => {
    runMigrations(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('schema_version');
    expect(tableNames).toContain('documents');
    expect(tableNames).toContain('sections');
    expect(tableNames).toContain('links');
    expect(tableNames).toContain('source_refs_state');
    expect(tableNames).toContain('sections_fts');
  });

  it('should set schema_version to 1 after initial migration', () => {
    runMigrations(db);

    const row = db
      .prepare('SELECT MAX(version) AS v FROM schema_version')
      .get() as { v: number };
    expect(row.v).toBe(1);
  });

  it('should be idempotent (running twice is safe)', () => {
    runMigrations(db);
    runMigrations(db); // Should not throw

    const row = db
      .prepare('SELECT COUNT(*) AS cnt FROM schema_version')
      .get() as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it('should create indexes on documents table', () => {
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='documents'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_documents_filepath');
    expect(indexNames).toContain('idx_documents_title');
    expect(indexNames).toContain('idx_documents_updated_at');
    expect(indexNames).toContain('idx_documents_doc_type');
  });

  it('should create indexes on sections table', () => {
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sections'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_sections_doc_id');
    expect(indexNames).toContain('idx_sections_heading');
    expect(indexNames).toContain('idx_sections_embedding_model');
    expect(indexNames).toContain('idx_sections_content_hash');
    expect(indexNames).toContain('idx_sections_doc_order');
  });

  it('should create indexes on links table', () => {
    runMigrations(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='links'",
      )
      .all() as Array<{ name: string }>;
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_links_target');
    expect(indexNames).toContain('idx_links_type');
    expect(indexNames).toContain('idx_links_source_section');
    expect(indexNames).toContain('idx_links_dangling');
  });

  it('should create FTS5 triggers', () => {
    runMigrations(db);

    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all() as Array<{ name: string }>;
    const triggerNames = triggers.map((t) => t.name);

    expect(triggerNames).toContain('sections_fts_insert');
    expect(triggerNames).toContain('sections_fts_update');
    expect(triggerNames).toContain('sections_fts_delete');
  });

  it('should enforce doc_type CHECK constraint', () => {
    runMigrations(db);

    expect(() => {
      db.prepare(
        `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
         VALUES ('id1', 'test.md', 'Test', 'invalid_type', 'hash', '2026-01-01', '2026-01-01')`,
      ).run();
    }).toThrow();
  });

  it('should enforce links type CHECK constraint', () => {
    runMigrations(db);

    // First insert a document
    db.prepare(
      `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
       VALUES ('doc1', 'test.md', 'Test', 'spec', 'hash', '2026-01-01', '2026-01-01')`,
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO links (source_doc_id, type, created_at)
         VALUES ('doc1', 'invalid_link_type', '2026-01-01')`,
      ).run();
    }).toThrow();
  });

  it('should support links with NULL target_doc_id (dangling links)', () => {
    runMigrations(db);

    db.prepare(
      `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
       VALUES ('doc1', 'test.md', 'Test', 'spec', 'hash', '2026-01-01', '2026-01-01')`,
    ).run();

    // Dangling link (target_doc_id is NULL)
    db.prepare(
      `INSERT INTO links (source_doc_id, target_doc_id, type, target_title, created_at)
       VALUES ('doc1', NULL, 'references', 'Missing Doc', '2026-01-01')`,
    ).run();

    const link = db
      .prepare('SELECT * FROM links WHERE source_doc_id = ?')
      .get('doc1') as { target_doc_id: string | null; target_title: string };
    expect(link.target_doc_id).toBeNull();
    expect(link.target_title).toBe('Missing Doc');
  });

  it('should cascade delete sections when document is deleted', () => {
    runMigrations(db);

    db.prepare(
      `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
       VALUES ('doc1', 'test.md', 'Test', 'spec', 'hash', '2026-01-01', '2026-01-01')`,
    ).run();

    db.prepare(
      `INSERT INTO sections (doc_id, section_order, content, content_hash, updated_at)
       VALUES ('doc1', 0, 'test content', 'hash1', '2026-01-01')`,
    ).run();

    db.prepare('DELETE FROM documents WHERE id = ?').run('doc1');

    const sections = db
      .prepare('SELECT * FROM sections WHERE doc_id = ?')
      .all('doc1');
    expect(sections.length).toBe(0);
  });
});
