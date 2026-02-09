import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DatabaseManager } from '../../data/database-manager.js';
import { StalenessDetector } from './staleness-detector.js';
import { hashString } from '../../shared/hash.js';
import type { UbpConfig } from '../../config/types.js';
import { DEFAULT_CONFIG } from '../../config/types.js';

describe('StalenessDetector', () => {
  let tmpDir: string;
  let dbPath: string;
  let db: DatabaseManager;
  let detector: StalenessDetector;
  let config: UbpConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-staleness-test-'));
    dbPath = path.join(tmpDir, 'test.db');
    db = new DatabaseManager({ dbPath });
    db.initialize();
    config = { ...DEFAULT_CONFIG };
    detector = new StalenessDetector(db, config, tmpDir);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createDoc(id: string, filepath: string, title: string): void {
    db.documents.upsert({
      id,
      filepath,
      title,
      doc_type: 'spec',
      body_hash: hashString('content'),
    });
  }

  describe('getStaleness', () => {
    it('returns "fresh" when document has no source_refs', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      const result = detector.getStaleness('doc-1');
      expect(result).toBe('fresh');
    });

    it('returns "fresh" when all source_refs are not stale', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/index.ts', hash: 'abc123' },
      ]);
      const result = detector.getStaleness('doc-1');
      expect(result).toBe('fresh');
    });

    it('returns "stale" when a source_ref hash has changed', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/index.ts', hash: 'abc123' },
      ]);
      // Simulate hash change
      db.sourceRefs.updateStaleness('src/index.ts', 'different_hash');
      const result = detector.getStaleness('doc-1');
      expect(result).toBe('stale');
    });

    it('returns "untracked" when source_ref has empty synced hash and is marked stale', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/nonexistent.ts', hash: '' },
      ]);
      // Update with a non-matching hash: empty '' != 'some_hash' -> is_stale=1
      // But last_synced_hash is '' (falsy) -> untracked
      db.sourceRefs.updateStaleness('src/nonexistent.ts', 'some_hash');
      const result = detector.getStaleness('doc-1');
      expect(result).toBe('untracked');
    });
  });

  describe('getStaleRefs', () => {
    it('returns empty array when no refs are stale', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/a.ts', hash: 'aaa' },
      ]);
      const result = detector.getStaleRefs('doc-1');
      expect(result).toEqual([]);
    });

    it('returns stale file paths', () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/a.ts', hash: 'aaa' },
        { filePath: 'src/b.ts', hash: 'bbb' },
      ]);
      // Mark src/a.ts as stale
      db.sourceRefs.updateStaleness('src/a.ts', 'changed_hash');
      const result = detector.getStaleRefs('doc-1');
      expect(result).toEqual(['src/a.ts']);
    });
  });

  describe('checkAll', () => {
    it('marks refs as stale when files have changed', async () => {
      // Create a real file
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const filePath = path.join(srcDir, 'main.ts');
      fs.writeFileSync(filePath, 'original content');

      createDoc('doc-1', 'spec.md', 'Spec');
      const originalHash = hashString('original content');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/main.ts', hash: originalHash },
      ]);

      // File hasn't changed yet
      await detector.checkAll();
      expect(detector.getStaleness('doc-1')).toBe('fresh');

      // Modify the file
      fs.writeFileSync(filePath, 'modified content');
      await detector.checkAll();
      expect(detector.getStaleness('doc-1')).toBe('stale');
    });

    it('marks refs as stale when files are deleted', async () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/deleted.ts', hash: 'somehash' },
      ]);

      await detector.checkAll();
      expect(detector.getStaleness('doc-1')).toBe('stale');
    });
  });

  describe('getStaleDocuments', () => {
    it('returns empty array when no documents are stale', async () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      // No source_refs means "fresh"
      const result = await detector.getStaleDocuments();
      expect(result).toEqual([]);
    });

    it('returns stale documents with their refs', async () => {
      createDoc('doc-1', 'spec.md', 'Spec');
      db.sourceRefs.syncByDocId('doc-1', [
        { filePath: 'src/missing.ts', hash: 'somehash' },
      ]);

      const result = await detector.getStaleDocuments();
      expect(result).toHaveLength(1);
      expect(result[0]!.doc_id).toBe('doc-1');
      expect(result[0]!.filepath).toBe('spec.md');
      expect(result[0]!.stale_refs).toHaveLength(1);
      expect(result[0]!.stale_refs[0]!.source_path).toBe('src/missing.ts');
    });
  });
});
