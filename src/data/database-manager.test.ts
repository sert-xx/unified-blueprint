import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { DatabaseManager } from './database-manager.js';
import { DatabaseError } from '../shared/errors.js';

function makeTempDbPath(): string {
  const dir = join(tmpdir(), 'ubp-test-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  return join(dir, 'knowledge.db');
}

describe('DatabaseManager', () => {
  const dbPaths: string[] = [];

  function createManager(dbPath?: string) {
    const path = dbPath ?? makeTempDbPath();
    dbPaths.push(path);
    return new DatabaseManager({ dbPath: path });
  }

  afterEach(() => {
    for (const path of dbPaths) {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          unlinkSync(path + suffix);
        } catch {
          // ignore
        }
      }
    }
    dbPaths.length = 0;
  });

  it('should initialize and create the database file', () => {
    const manager = createManager();
    manager.initialize();

    const dbPath = dbPaths[0]!;
    expect(existsSync(dbPath)).toBe(true);

    manager.close();
  });

  it('should provide access to the database instance', () => {
    const manager = createManager();
    manager.initialize();

    const db = manager.getDb();
    expect(db).toBeDefined();

    manager.close();
  });

  it('should throw if getDb is called before initialize', () => {
    const manager = createManager();
    expect(() => manager.getDb()).toThrow(DatabaseError);
  });

  it('should provide StatementCache', () => {
    const manager = createManager();
    manager.initialize();

    const cache = manager.getStatementCache();
    expect(cache).toBeDefined();

    manager.close();
  });

  it('should provide VectorIndex', () => {
    const manager = createManager();
    manager.initialize();

    const vectorIndex = manager.getVectorIndex();
    expect(vectorIndex).toBeDefined();
    expect(vectorIndex.size).toBe(0);

    manager.close();
  });

  it('should provide repository accessors', () => {
    const manager = createManager();
    manager.initialize();

    expect(manager.documents).toBeDefined();
    expect(manager.sections).toBeDefined();
    expect(manager.links).toBeDefined();
    expect(manager.sourceRefs).toBeDefined();
    expect(manager.graph).toBeDefined();
    expect(manager.fulltext).toBeDefined();

    manager.close();
  });

  it('should run migrations automatically', () => {
    const manager = createManager();
    manager.initialize();

    const db = manager.getDb();
    const version = db
      .prepare('SELECT MAX(version) AS v FROM schema_version')
      .get() as { v: number };
    expect(version.v).toBe(1);

    manager.close();
  });

  it('should enable WAL mode', () => {
    const manager = createManager();
    manager.initialize();

    const db = manager.getDb();
    const result = db.pragma('journal_mode') as Array<{
      journal_mode: string;
    }>;
    expect(result[0]!.journal_mode).toBe('wal');

    manager.close();
  });

  it('should enable foreign keys', () => {
    const manager = createManager();
    manager.initialize();

    const db = manager.getDb();
    const result = db.pragma('foreign_keys') as Array<{
      foreign_keys: number;
    }>;
    expect(result[0]!.foreign_keys).toBe(1);

    manager.close();
  });

  it('should close cleanly', () => {
    const manager = createManager();
    manager.initialize();
    manager.close();

    // After close, getDb should throw
    expect(() => manager.getDb()).toThrow(DatabaseError);
  });

  it('should handle double close gracefully', () => {
    const manager = createManager();
    manager.initialize();
    manager.close();
    // Second close should not throw
    manager.close();
  });

  it('should perform CRUD through repositories', () => {
    const manager = createManager();
    manager.initialize();

    // Insert a document
    const result = manager.documents.upsert({
      id: 'test-doc',
      filepath: 'test.md',
      title: 'Test Document',
      doc_type: 'spec',
      body_hash: 'hash123',
    });
    expect(result.changed).toBe(true);

    // Find it
    const doc = manager.documents.findById('test-doc');
    expect(doc).not.toBeNull();
    expect(doc!.title).toBe('Test Document');

    // Insert sections
    manager.sections.replaceByDocId('test-doc', [
      {
        doc_id: 'test-doc',
        heading: 'Intro',
        section_order: 0,
        content: 'Hello world',
        content_hash: 'sec-hash',
        token_count: 5,
      },
    ]);

    expect(manager.sections.count()).toBe(1);

    // Fulltext search
    const ftsResults = manager.fulltext.search('Hello');
    expect(ftsResults.length).toBe(1);

    manager.close();
  });
});
