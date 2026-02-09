import { describe, it, expect } from 'vitest';
import { GraphScorer } from './graph-scorer.js';
import type { GraphNode } from '../../data/types.js';

function makeNode(
  docId: string,
  depth: number,
  overrides?: Partial<GraphNode>,
): GraphNode {
  return {
    docId,
    title: `Doc ${docId}`,
    docType: 'spec',
    depth,
    linkType: 'references',
    direction: 'outgoing',
    ...overrides,
  };
}

describe('GraphScorer', () => {
  const scorer = new GraphScorer();

  describe('score', () => {
    it('returns empty map for empty nodes', () => {
      const result = scorer.score([]);
      expect(result.size).toBe(0);
    });

    it('computes 1/depth for each node', () => {
      const nodes: GraphNode[] = [
        makeNode('a', 1),
        makeNode('b', 2),
        makeNode('c', 3),
      ];
      const result = scorer.score(nodes);

      expect(result.get('a')).toBeCloseTo(1.0);
      expect(result.get('b')).toBeCloseTo(0.5);
      expect(result.get('c')).toBeCloseTo(1 / 3);
    });

    it('returns 0 for depth=0 (center node)', () => {
      const nodes: GraphNode[] = [makeNode('center', 0)];
      const result = scorer.score(nodes);
      expect(result.get('center')).toBe(0);
    });

    it('keeps highest proximity when duplicate docIds appear', () => {
      const nodes: GraphNode[] = [
        makeNode('a', 3), // proximity 0.33
        makeNode('a', 1), // proximity 1.0 -- should win
      ];
      const result = scorer.score(nodes);
      expect(result.get('a')).toBeCloseTo(1.0);
    });

    it('handles single-hop and multi-hop together', () => {
      const nodes: GraphNode[] = [
        makeNode('a', 1),
        makeNode('b', 2),
        makeNode('a', 2), // duplicate, but 1-hop is closer
      ];
      const result = scorer.score(nodes);
      expect(result.get('a')).toBeCloseTo(1.0);
      expect(result.get('b')).toBeCloseTo(0.5);
    });
  });

  describe('scoreDetailed', () => {
    it('returns sorted results by proximity descending', () => {
      const nodes: GraphNode[] = [
        makeNode('far', 3),
        makeNode('close', 1),
        makeNode('mid', 2),
      ];
      const results = scorer.scoreDetailed(nodes);

      expect(results).toHaveLength(3);
      expect(results[0]!.docId).toBe('close');
      expect(results[0]!.proximity).toBeCloseTo(1.0);
      expect(results[0]!.hopDistance).toBe(1);

      expect(results[1]!.docId).toBe('mid');
      expect(results[1]!.proximity).toBeCloseTo(0.5);

      expect(results[2]!.docId).toBe('far');
      expect(results[2]!.proximity).toBeCloseTo(1 / 3);
    });

    it('deduplicates and keeps the best score', () => {
      const nodes: GraphNode[] = [
        makeNode('a', 3),
        makeNode('a', 1),
      ];
      const results = scorer.scoreDetailed(nodes);
      expect(results).toHaveLength(1);
      expect(results[0]!.proximity).toBeCloseTo(1.0);
      expect(results[0]!.hopDistance).toBe(1);
    });
  });
});
