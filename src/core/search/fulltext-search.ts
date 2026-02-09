/**
 * FulltextSearch - FTS5 search wrapper
 */

import type { FulltextSearchService } from '../../data/services/fulltext-search-service.js';
import type { FulltextSearchResult } from '../../data/types.js';

export class FulltextSearch {
  constructor(private readonly fulltextService: FulltextSearchService) {}

  /**
   * Perform full-text search using FTS5.
   */
  search(query: string, limit: number = 20): FulltextSearchResult[] {
    return this.fulltextService.search(query, limit);
  }
}
