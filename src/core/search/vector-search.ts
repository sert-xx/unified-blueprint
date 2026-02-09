/**
 * VectorSearch - VectorIndex wrapper for search operations
 */

import type { VectorIndex } from '../../data/vector-index.js';
import type { VectorSearchResult } from '../../data/types.js';

export class VectorSearch {
  constructor(private readonly vectorIndex: VectorIndex) {}

  /**
   * Search for similar sections by vector similarity.
   */
  search(queryEmbedding: Float32Array, topK: number): VectorSearchResult[] {
    return this.vectorIndex.search(queryEmbedding, topK);
  }

  /**
   * Check if the vector index has any entries.
   */
  get isEmpty(): boolean {
    return this.vectorIndex.size === 0;
  }

  get size(): number {
    return this.vectorIndex.size;
  }
}
