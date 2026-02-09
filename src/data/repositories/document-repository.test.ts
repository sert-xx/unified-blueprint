import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StatementCache } from '../statement-cache.js';
import { runMigrations } from '../migrations/index.js';
import { createDocumentRepository } from './document-repository.js';
import type { DocumentRepository } from './document-repository.js';

describe('DocumentRepository', () => {
  let db: Database.Database;
  let cache: StatementCache;
  let repo: DocumentRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    cache = new StatementCache(db);
    repo = createDocumentRepository(cache);
  });

  afterEach(() => {
    cache.clear();
    db.close();
  });

  const sampleDoc = {
    id: 'doc-001',
    filepath: 'specs/requirements.md',
    title: 'Requirements',
    doc_type: 'spec' as const,
    body_hash: 'abc123',
  };

  it('should upsert a new document', () => {
    const result = repo.upsert(sampleDoc);
    expect(result.changed).toBe(true);
  });

  it('should return changed=false when body_hash is identical', () => {
    repo.upsert(sampleDoc);
    const result = repo.upsert(sampleDoc);
    expect(result.changed).toBe(false);
  });

  it('should return changed=true when body_hash differs', () => {
    repo.upsert(sampleDoc);
    const result = repo.upsert({ ...sampleDoc, body_hash: 'xyz789' });
    expect(result.changed).toBe(true);
  });

  it('should find document by ID', () => {
    repo.upsert(sampleDoc);
    const doc = repo.findById('doc-001');
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('Requirements');
    expect(doc!.filepath).toBe('specs/requirements.md');
  });

  it('should return null for non-existent ID', () => {
    const doc = repo.findById('non-existent');
    expect(doc).toBeNull();
  });

  it('should find document by filepath', () => {
    repo.upsert(sampleDoc);
    const doc = repo.findByFilepath('specs/requirements.md');
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe('doc-001');
  });

  it('should find documents by title (partial match)', () => {
    repo.upsert(sampleDoc);
    repo.upsert({
      id: 'doc-002',
      filepath: 'specs/design.md',
      title: 'Design Document',
      doc_type: 'design',
      body_hash: 'def456',
    });

    const results = repo.findByTitle('Req');
    expect(results.length).toBe(1);
    expect(results[0]!.title).toBe('Requirements');
  });

  it('should list all documents with default sorting', () => {
    repo.upsert(sampleDoc);
    repo.upsert({
      id: 'doc-002',
      filepath: 'specs/arch.md',
      title: 'Architecture',
      doc_type: 'design',
      body_hash: 'def456',
    });

    const all = repo.findAll();
    expect(all.length).toBe(2);
    // Default sort by title asc
    expect(all[0]!.title).toBe('Architecture');
    expect(all[1]!.title).toBe('Requirements');
  });

  it('should filter by doc_type', () => {
    repo.upsert(sampleDoc);
    repo.upsert({
      id: 'doc-002',
      filepath: 'specs/arch.md',
      title: 'Architecture',
      doc_type: 'design',
      body_hash: 'def456',
    });

    const specs = repo.findAll({ docType: 'spec' });
    expect(specs.length).toBe(1);
    expect(specs[0]!.doc_type).toBe('spec');
  });

  it('should delete by ID', () => {
    repo.upsert(sampleDoc);
    repo.deleteById('doc-001');
    expect(repo.findById('doc-001')).toBeNull();
  });

  it('should delete documents not in filepath list', () => {
    repo.upsert(sampleDoc);
    repo.upsert({
      id: 'doc-002',
      filepath: 'specs/arch.md',
      title: 'Architecture',
      doc_type: 'design',
      body_hash: 'def456',
    });

    const deleted = repo.deleteNotIn(['specs/requirements.md']);
    expect(deleted).toEqual(['doc-002']);
    expect(repo.findById('doc-002')).toBeNull();
    expect(repo.findById('doc-001')).not.toBeNull();
  });

  it('should delete all documents when given empty filepath list', () => {
    repo.upsert(sampleDoc);
    const deleted = repo.deleteNotIn([]);
    expect(deleted).toEqual(['doc-001']);
    expect(repo.findAll().length).toBe(0);
  });

  it('should preserve created_at on update', () => {
    repo.upsert(sampleDoc);
    const first = repo.findById('doc-001');

    // Small delay simulation: change body_hash
    repo.upsert({ ...sampleDoc, body_hash: 'newhash' });
    const second = repo.findById('doc-001');

    expect(second!.created_at).toBe(first!.created_at);
    // updated_at should be different (or same if executed too fast, but logically different)
  });
});
