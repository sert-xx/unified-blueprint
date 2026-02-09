import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { StatementCache } from './statement-cache.js';

describe('StatementCache', () => {
  let db: Database.Database;
  let cache: StatementCache;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
    cache = new StatementCache(db);
  });

  afterEach(() => {
    cache.clear();
    db.close();
  });

  it('should prepare and cache a statement on first access', () => {
    const stmt = cache.get('insert_test', 'INSERT INTO test (name) VALUES (?)');
    expect(stmt).toBeDefined();
    expect(cache.size).toBe(1);
  });

  it('should return the same statement on subsequent access', () => {
    const stmt1 = cache.get('insert_test', 'INSERT INTO test (name) VALUES (?)');
    const stmt2 = cache.get('insert_test', 'INSERT INTO test (name) VALUES (?)');
    expect(stmt1).toBe(stmt2);
    expect(cache.size).toBe(1);
  });

  it('should cache different statements under different keys', () => {
    cache.get('insert_test', 'INSERT INTO test (name) VALUES (?)');
    cache.get('select_test', 'SELECT * FROM test WHERE id = ?');
    expect(cache.size).toBe(2);
  });

  it('should work with actual SQL operations', () => {
    const insertStmt = cache.get(
      'insert_test',
      'INSERT INTO test (name) VALUES (?)',
    );
    insertStmt.run('hello');

    const selectStmt = cache.get(
      'select_test',
      'SELECT * FROM test WHERE name = ?',
    );
    const row = selectStmt.get('hello') as { id: number; name: string };
    expect(row.name).toBe('hello');
  });

  it('should clear all cached statements', () => {
    cache.get('insert_test', 'INSERT INTO test (name) VALUES (?)');
    cache.get('select_test', 'SELECT * FROM test WHERE id = ?');
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
  });
});
