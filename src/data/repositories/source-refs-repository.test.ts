import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StatementCache } from '../statement-cache.js';
import { runMigrations } from '../migrations/index.js';
import { createDocumentRepository } from './document-repository.js';
import { createSourceRefsStateRepository } from './source-refs-repository.js';
import type { SourceRefsStateRepository } from './source-refs-repository.js';

describe('SourceRefsStateRepository', () => {
  let db: Database.Database;
  let cache: StatementCache;
  let repo: SourceRefsStateRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    cache = new StatementCache(db);

    const docRepo = createDocumentRepository(cache);
    docRepo.upsert({
      id: 'doc-1',
      filepath: 'specs/a.md',
      title: 'Doc A',
      doc_type: 'spec',
      body_hash: 'h1',
    });

    repo = createSourceRefsStateRepository(cache);
  });

  afterEach(() => {
    cache.clear();
    db.close();
  });

  it('should sync source refs for a document', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
      { filePath: 'src/utils.ts', hash: 'def456' },
    ]);

    const refs = repo.findByDocId('doc-1');
    expect(refs.length).toBe(2);
    expect(refs[0]!.file_path).toBe('src/app.ts');
    expect(refs[0]!.is_stale).toBe(0);
  });

  it('should replace refs on second sync', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
    ]);
    repo.syncByDocId('doc-1', [
      { filePath: 'src/new.ts', hash: 'ghi789' },
    ]);

    const refs = repo.findByDocId('doc-1');
    expect(refs.length).toBe(1);
    expect(refs[0]!.file_path).toBe('src/new.ts');
  });

  it('should update staleness when hash changes', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
    ]);

    // Hash changed → stale
    repo.updateStaleness('src/app.ts', 'different_hash');

    const refs = repo.findByDocId('doc-1');
    expect(refs[0]!.is_stale).toBe(1);
  });

  it('should keep fresh when hash matches', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
    ]);

    repo.updateStaleness('src/app.ts', 'abc123');

    const refs = repo.findByDocId('doc-1');
    expect(refs[0]!.is_stale).toBe(0);
  });

  it('should find stale refs with doc info', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
    ]);
    repo.updateStaleness('src/app.ts', 'changed');

    const stale = repo.findStale();
    expect(stale.length).toBe(1);
    expect(stale[0]!.doc_title).toBe('Doc A');
    expect(stale[0]!.doc_filepath).toBe('specs/a.md');
  });

  it('should return correct summary', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
      { filePath: 'src/utils.ts', hash: 'def456' },
    ]);
    repo.updateStaleness('src/app.ts', 'changed');

    const summary = repo.summary();
    expect(summary.total).toBe(2);
    expect(summary.fresh).toBe(1);
    expect(summary.stale).toBe(1);
  });

  it('should handle empty sync', () => {
    repo.syncByDocId('doc-1', [
      { filePath: 'src/app.ts', hash: 'abc123' },
    ]);
    repo.syncByDocId('doc-1', []);

    const refs = repo.findByDocId('doc-1');
    expect(refs.length).toBe(0);
  });
});
