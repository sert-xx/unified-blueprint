import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations/index.js';
import { createGraphQueryService } from './graph-query-service.js';
import type { GraphQueryService } from './graph-query-service.js';

function insertDoc(
  db: Database.Database,
  id: string,
  title: string,
  docType: string = 'spec',
) {
  db.prepare(
    `INSERT INTO documents (id, filepath, title, doc_type, body_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'hash', '2026-01-01', '2026-01-01')`,
  ).run(id, `${id}.md`, title, docType);
}

function insertLink(
  db: Database.Database,
  source: string,
  target: string | null,
  type: string = 'references',
) {
  db.prepare(
    `INSERT INTO links (source_doc_id, target_doc_id, type, created_at)
     VALUES (?, ?, ?, '2026-01-01')`,
  ).run(source, target, type);
}

describe('GraphQueryService', () => {
  let db: Database.Database;
  let graph: GraphQueryService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    graph = createGraphQueryService(db);

    // Create a graph: A -> B -> C, A -> D, E -> A
    insertDoc(db, 'A', 'Doc A');
    insertDoc(db, 'B', 'Doc B');
    insertDoc(db, 'C', 'Doc C');
    insertDoc(db, 'D', 'Doc D');
    insertDoc(db, 'E', 'Doc E');

    insertLink(db, 'A', 'B', 'references');
    insertLink(db, 'B', 'C', 'depends_on');
    insertLink(db, 'A', 'D', 'implements');
    insertLink(db, 'E', 'A', 'references');
  });

  afterEach(() => {
    db.close();
  });

  describe('traverseForward', () => {
    it('should find direct outlinks (depth=1)', () => {
      const nodes = graph.traverseForward('A', 1);
      expect(nodes.length).toBe(2);
      const ids = nodes.map((n) => n.docId).sort();
      expect(ids).toEqual(['B', 'D']);
    });

    it('should find transitive outlinks (depth=2)', () => {
      const nodes = graph.traverseForward('A', 2);
      const ids = nodes.map((n) => n.docId).sort();
      expect(ids).toEqual(['B', 'C', 'D']);
    });

    it('should respect maxDepth', () => {
      const nodes = graph.traverseForward('B', 1);
      expect(nodes.length).toBe(1);
      expect(nodes[0]!.docId).toBe('C');
    });

    it('should filter by link types', () => {
      const nodes = graph.traverseForward('A', 1, ['implements']);
      expect(nodes.length).toBe(1);
      expect(nodes[0]!.docId).toBe('D');
    });

    it('should return empty for leaf node', () => {
      const nodes = graph.traverseForward('C', 1);
      expect(nodes.length).toBe(0);
    });
  });

  describe('traverseBackward', () => {
    it('should find direct backlinks (depth=1)', () => {
      const nodes = graph.traverseBackward('A', 1);
      expect(nodes.length).toBe(1);
      expect(nodes[0]!.docId).toBe('E');
    });

    it('should find transitive backlinks (depth=2)', () => {
      const nodes = graph.traverseBackward('C', 2);
      const ids = nodes.map((n) => n.docId).sort();
      expect(ids).toEqual(['A', 'B']);
    });

    it('should return empty for root node', () => {
      const nodes = graph.traverseBackward('E', 1);
      expect(nodes.length).toBe(0);
    });
  });

  describe('traverseBidirectional', () => {
    it('should combine forward and backward', () => {
      const nodes = graph.traverseBidirectional('A', 1);
      const ids = nodes.map((n) => n.docId).sort();
      expect(ids).toEqual(['B', 'D', 'E']);
    });

    it('should prefer shorter depth for duplicate nodes', () => {
      // B is reachable from A forward (depth=1)
      const nodes = graph.traverseBidirectional('A', 2);
      const bNode = nodes.find((n) => n.docId === 'B');
      expect(bNode!.depth).toBe(1);
    });
  });

  describe('getGraphStructure', () => {
    it('should return full graph when centerDocId is null', () => {
      const result = graph.getGraphStructure(null, 2);
      expect(result.nodes.length).toBe(5);
      expect(result.edges.length).toBe(4);
    });

    it('should return subgraph centered on a doc', () => {
      const result = graph.getGraphStructure('A', 1);
      // Center (A) + forward (B, D) + backward (E)
      expect(result.nodes.length).toBe(4);
      // Edges between known nodes
      expect(result.edges.length).toBeGreaterThan(0);
    });

    it('should include link counts', () => {
      const result = graph.getGraphStructure(null, 2);
      const nodeA = result.nodes.find((n) => n.id === 'A');
      expect(nodeA!.outgoingLinkCount).toBe(2); // A -> B, A -> D
    });
  });
});
