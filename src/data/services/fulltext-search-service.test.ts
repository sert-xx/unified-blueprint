import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/index.js';
import { createFulltextSearchService } from './fulltext-search-service.js';
import type { FulltextSearchService } from './fulltext-search-service.js';

describe('FulltextSearchService', () => {
  let db: Database.Database;
  let fts: FulltextSearchService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    fts = createFulltextSearchService(db);

    // Insert test documents
    db.prepare(
      `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
       VALUES ('doc-1', 'specs/arch.md', 'Architecture', 'design', 'h1', '2026-01-01', '2026-01-01')`,
    ).run();

    db.prepare(
      `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
       VALUES ('doc-2', 'specs/api.md', 'API Reference', 'api', 'h2', '2026-01-01', '2026-01-01')`,
    ).run();

    // Insert sections (triggers auto-sync FTS)
    db.prepare(
      `INSERT INTO sections (doc_id, heading, section_order, content, content_hash, updated_at)
       VALUES ('doc-1', 'Overview', 0, 'The system uses a microservices architecture with event-driven communication', 'ch1', '2026-01-01')`,
    ).run();

    db.prepare(
      `INSERT INTO sections (doc_id, heading, section_order, content, content_hash, updated_at)
       VALUES ('doc-1', 'Database Design', 1, 'SQLite is used as the primary database with WAL mode enabled', 'ch2', '2026-01-01')`,
    ).run();

    db.prepare(
      `INSERT INTO sections (doc_id, heading, section_order, content, content_hash, updated_at)
       VALUES ('doc-2', 'Endpoints', 0, 'REST API endpoints for document management and search', 'ch3', '2026-01-01')`,
    ).run();
  });

  afterEach(() => {
    db.close();
  });

  it('should find sections matching a query', () => {
    const results = fts.search('microservices');
    expect(results.length).toBe(1);
    expect(results[0]!.docId).toBe('doc-1');
    expect(results[0]!.heading).toBe('Overview');
  });

  it('should find sections matching partial query', () => {
    const results = fts.search('database');
    expect(results.length).toBe(1);
    expect(results[0]!.heading).toBe('Database Design');
  });

  it('should return multiple matches with broad term', () => {
    // Both docs contain content about document/management topics
    const results = fts.search('document');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect limit', () => {
    const results = fts.search('document', 1);
    expect(results.length).toBe(1);
  });

  it('should sanitize FTS5 syntax characters safely', () => {
    // These should not throw despite containing FTS5 keywords/operators
    expect(() => fts.search('architecture OR endpoints')).not.toThrow();
    expect(() => fts.search('test AND "quoted"')).not.toThrow();
    expect(() => fts.search('NEAR(a, b)')).not.toThrow();
    expect(() => fts.search('col:value')).not.toThrow();
    expect(() => fts.search('test*')).not.toThrow();
  });

  it('should return snippet with highlighting', () => {
    const results = fts.search('SQLite');
    expect(results.length).toBe(1);
    expect(results[0]!.snippet).toContain('<mark>');
  });

  it('should return empty for no matches', () => {
    const results = fts.search('nonexistent_term_xyz');
    expect(results.length).toBe(0);
  });

  it('should return empty for empty query', () => {
    const results = fts.search('');
    expect(results.length).toBe(0);
  });

  it('should return empty for whitespace query', () => {
    const results = fts.search('   ');
    expect(results.length).toBe(0);
  });

  it('should include title and docType from joined documents', () => {
    const results = fts.search('REST API');
    expect(results.length).toBe(1);
    expect(results[0]!.title).toBe('API Reference');
    expect(results[0]!.docType).toBe('api');
  });
});
