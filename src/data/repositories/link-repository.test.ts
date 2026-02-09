import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StatementCache } from '../statement-cache.js';
import { runMigrations } from '../migrations/index.js';
import { createDocumentRepository } from './document-repository.js';
import { createLinkRepository } from './link-repository.js';
import type { LinkRepository } from './link-repository.js';

describe('LinkRepository', () => {
  let db: Database.Database;
  let cache: StatementCache;
  let linkRepo: LinkRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    cache = new StatementCache(db);

    const docRepo = createDocumentRepository(cache);
    docRepo.upsert({
      id: 'doc-1',
      filepath: 'specs/a.md',
      title: 'Document A',
      doc_type: 'spec',
      body_hash: 'h1',
    });
    docRepo.upsert({
      id: 'doc-2',
      filepath: 'specs/b.md',
      title: 'Document B',
      doc_type: 'spec',
      body_hash: 'h2',
    });
    docRepo.upsert({
      id: 'doc-3',
      filepath: 'specs/c.md',
      title: 'Document C',
      doc_type: 'design',
      body_hash: 'h3',
    });

    linkRepo = createLinkRepository(cache);
  });

  afterEach(() => {
    cache.clear();
    db.close();
  });

  it('should insert links and find by source doc id', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: 'See Document B',
        source_section_id: null,
        target_title: 'Document B',
      },
    ]);

    const links = linkRepo.findBySourceDocId('doc-1');
    expect(links.length).toBe(1);
    expect(links[0]!.target_doc_id).toBe('doc-2');
    expect(links[0]!.type).toBe('references');
  });

  it('should find backlinks by target doc id', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: null,
        source_section_id: null,
        target_title: 'Document B',
      },
    ]);

    const backlinks = linkRepo.findByTargetDocId('doc-2');
    expect(backlinks.length).toBe(1);
    expect(backlinks[0]!.source_doc_id).toBe('doc-1');
  });

  it('should replace existing links on second call', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: null,
        source_section_id: null,
        target_title: 'Document B',
      },
    ]);

    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-3',
        type: 'depends_on',
        context: null,
        source_section_id: null,
        target_title: 'Document C',
      },
    ]);

    const links = linkRepo.findBySourceDocId('doc-1');
    expect(links.length).toBe(1);
    expect(links[0]!.target_doc_id).toBe('doc-3');
  });

  it('should support dangling links (null target_doc_id)', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: null,
        type: 'references',
        context: null,
        source_section_id: null,
        target_title: 'Unknown Document',
      },
    ]);

    const dangling = linkRepo.findDangling();
    expect(dangling.length).toBe(1);
    expect(dangling[0]!.target_title).toBe('Unknown Document');
  });

  it('should resolve dangling links by title', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: null,
        type: 'references',
        context: null,
        source_section_id: null,
        target_title: 'Document B',
      },
    ]);

    const resolved = linkRepo.resolveDangling('Document B', 'doc-2');
    expect(resolved).toBe(1);

    const dangling = linkRepo.findDangling();
    expect(dangling.length).toBe(0);

    const links = linkRepo.findBySourceDocId('doc-1');
    expect(links[0]!.target_doc_id).toBe('doc-2');
  });

  it('should count links correctly', () => {
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: null,
        source_section_id: null,
        target_title: 'Document B',
      },
      {
        source_doc_id: 'doc-1',
        target_doc_id: null,
        type: 'depends_on',
        context: null,
        source_section_id: null,
        target_title: 'Missing',
      },
    ]);

    const counts = linkRepo.count();
    expect(counts.total).toBe(2);
    expect(counts.resolved).toBe(1);
    expect(counts.dangling).toBe(1);
  });

  it('should ignore duplicate links with INSERT OR IGNORE', () => {
    // Same source_doc_id, target_doc_id (via COALESCE), and type should be ignored
    linkRepo.replaceBySourceDocId('doc-1', [
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: 'first',
        source_section_id: null,
        target_title: 'Document B',
      },
      {
        source_doc_id: 'doc-1',
        target_doc_id: 'doc-2',
        type: 'references',
        context: 'second',
        source_section_id: null,
        target_title: 'Document B',
      },
    ]);

    const links = linkRepo.findBySourceDocId('doc-1');
    expect(links.length).toBe(1);
    expect(links[0]!.context).toBe('first'); // First insert wins
  });
});
