/**
 * GraphTraversal - N-hop graph exploration
 * Wraps the data layer's GraphQueryService for core layer use.
 */

import type { GraphQueryService } from '../../data/services/graph-query-service.js';
import type { GraphNode } from '../../data/types.js';

export class GraphTraversal {
  constructor(private readonly graphService: GraphQueryService) {}

  /**
   * Traverse links bidirectionally from a center document up to maxDepth hops.
   * Returns all reachable documents with their minimum hop distance.
   */
  traverse(centerDocId: string, maxDepth: number): GraphNode[] {
    return this.graphService.traverseBidirectional(centerDocId, maxDepth);
  }

  /**
   * Traverse outgoing links only.
   */
  traverseForward(centerDocId: string, maxDepth: number): GraphNode[] {
    return this.graphService.traverseForward(centerDocId, maxDepth);
  }

  /**
   * Traverse incoming links only.
   */
  traverseBackward(centerDocId: string, maxDepth: number): GraphNode[] {
    return this.graphService.traverseBackward(centerDocId, maxDepth);
  }
}
