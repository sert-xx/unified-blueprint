/**
 * GraphScorer - graph_proximity score calculation
 *
 * Computes graph proximity scores based on hop distance in the link graph.
 * graph_proximity = 1 / hop_distance
 *   1-hop: 1.0
 *   2-hop: 0.5
 *   3-hop: 0.33
 *   no link: 0.0
 */

import type { GraphNode } from '../../data/types.js';

export interface GraphProximityResult {
  docId: string;
  proximity: number;
  hopDistance: number;
}

export class GraphScorer {
  /**
   * Given a set of graph-reachable nodes from traversal,
   * compute graph_proximity scores for each document.
   *
   * @param nodes - Nodes found by graph traversal (with depth info)
   * @returns Map from docId to graph_proximity score
   */
  score(nodes: GraphNode[]): Map<string, number> {
    const scores = new Map<string, number>();

    for (const node of nodes) {
      const proximity = node.depth > 0 ? 1.0 / node.depth : 0;
      const existing = scores.get(node.docId);
      // Keep the highest proximity (closest hop)
      if (existing === undefined || proximity > existing) {
        scores.set(node.docId, proximity);
      }
    }

    return scores;
  }

  /**
   * Compute detailed proximity results.
   */
  scoreDetailed(nodes: GraphNode[]): GraphProximityResult[] {
    const scoreMap = new Map<string, GraphProximityResult>();

    for (const node of nodes) {
      const proximity = node.depth > 0 ? 1.0 / node.depth : 0;
      const existing = scoreMap.get(node.docId);
      if (!existing || proximity > existing.proximity) {
        scoreMap.set(node.docId, {
          docId: node.docId,
          proximity,
          hopDistance: node.depth,
        });
      }
    }

    return Array.from(scoreMap.values()).sort(
      (a, b) => b.proximity - a.proximity,
    );
  }
}
