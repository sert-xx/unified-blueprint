import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StatementCache } from '../statement-cache.js';
import { runMigrations } from '../migrations/index.js';
import { createDocumentRepository } from './document-repository.js';
import { createSectionRepository } from './section-repository.js';
import type { SectionRepository } from './section-repository.js';

describe('SectionRepository', () => {
  let db: Database.Database;
  let cache: StatementCache;
  let sectionRepo: SectionRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    cache = new StatementCache(db);

    // Insert a document to reference
    const docRepo = createDocumentRepository(cache);
    docRepo.upsert({
      id: 'doc-1',
      filepath: 'test.md',
      title: 'Test',
      doc_type: 'spec',
      body_hash: 'hash1',
    });

    sectionRepo = createSectionRepository(cache);
  });

  afterEach(() => {
    cache.clear();
    db.close();
  });

  const makeSections = (docId: string, count: number) =>
    Array.from({ length: count }, (_, i) => ({
      doc_id: docId,
      heading: i === 0 ? null : `Section ${i}`,
      section_order: i,
      content: `Content for section ${i}`,
      content_hash: `hash-${i}`,
      token_count: 50 + i,
    }));

  it('should replace sections by doc_id', () => {
    const sections = makeSections('doc-1', 3);
    sectionRepo.replaceByDocId('doc-1', sections);

    const result = sectionRepo.findByDocId('doc-1');
    expect(result.length).toBe(3);
    expect(result[0]!.section_order).toBe(0);
    expect(result[0]!.heading).toBeNull();
    expect(result[1]!.heading).toBe('Section 1');
  });

  it('should replace existing sections on second call', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 3));
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 2));

    const result = sectionRepo.findByDocId('doc-1');
    expect(result.length).toBe(2);
  });

  it('should find section by id', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 1));
    const all = sectionRepo.findByDocId('doc-1');
    const section = sectionRepo.findById(all[0]!.id);
    expect(section).not.toBeNull();
    expect(section!.content).toBe('Content for section 0');
  });

  it('should find pending embeddings', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 5));

    const pending = sectionRepo.findPendingEmbeddings();
    expect(pending.length).toBe(5); // All pending since no embedding set
  });

  it('should update embedding', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 1));
    const sections = sectionRepo.findByDocId('doc-1');
    const sectionId = sections[0]!.id;

    const embeddingData = Buffer.from(new Float32Array(384).buffer);
    sectionRepo.updateEmbedding(sectionId, embeddingData, 'all-MiniLM-L6-v2');

    const updated = sectionRepo.findById(sectionId);
    expect(updated!.embedding).not.toBeNull();
    expect(updated!.embedding_model).toBe('all-MiniLM-L6-v2');
  });

  it('should count sections', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 3));
    expect(sectionRepo.count()).toBe(3);
  });

  it('should count sections with embedding', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 3));
    expect(sectionRepo.countWithEmbedding()).toBe(0);

    // Add embedding to one section
    const sections = sectionRepo.findByDocId('doc-1');
    const embeddingData = Buffer.from(new Float32Array(384).buffer);
    sectionRepo.updateEmbedding(
      sections[0]!.id,
      embeddingData,
      'all-MiniLM-L6-v2',
    );

    expect(sectionRepo.countWithEmbedding()).toBe(1);
  });

  it('should find sections by embedding model mismatch', () => {
    sectionRepo.replaceByDocId('doc-1', makeSections('doc-1', 2));
    const sections = sectionRepo.findByDocId('doc-1');

    const embeddingData = Buffer.from(new Float32Array(384).buffer);
    sectionRepo.updateEmbedding(
      sections[0]!.id,
      embeddingData,
      'old-model',
    );

    const mismatch = sectionRepo.findByEmbeddingModelNot('new-model');
    expect(mismatch.length).toBe(1);
    expect(mismatch[0]!.id).toBe(sections[0]!.id);
  });

  it('should sync FTS on insert via trigger', () => {
    sectionRepo.replaceByDocId('doc-1', [
      {
        doc_id: 'doc-1',
        heading: 'Architecture Overview',
        section_order: 0,
        content: 'The system uses microservices architecture',
        content_hash: 'hash-0',
        token_count: 10,
      },
    ]);

    const ftsResults = db
      .prepare(
        `SELECT rowid FROM sections_fts WHERE sections_fts MATCH 'microservices'`,
      )
      .all();
    expect(ftsResults.length).toBe(1);
  });
});
