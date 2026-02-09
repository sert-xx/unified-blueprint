/**
 * Suggest-Links Engine
 *
 * Finds implicit link suggestions between documents based on
 * vector similarity of their sections.
 *
 * For each pair of documents that don't already have a direct link,
 * compares their section embeddings to find high-similarity pairs.
 */

import type { DatabaseManager } from '../../data/database-manager.js';
import type { VectorIndex } from '../../data/vector-index.js';
import type { LinkSuggestion } from '../../shared/types.js';
import { createLogger, type Logger } from '../../shared/logger.js';

export interface SuggestLinksOptions {
  /** Minimum similarity threshold (0-1). Default: 0.7 */
  threshold?: number;
  /** Maximum number of suggestions. Default: 20 */
  limit?: number;
}

export class SuggestLinksEngine {
  private readonly db: DatabaseManager;
  private readonly vectorIndex: VectorIndex;
  private readonly logger: Logger;

  constructor(db: DatabaseManager, vectorIndex: VectorIndex) {
    this.db = db;
    this.vectorIndex = vectorIndex;
    this.logger = createLogger('SuggestLinks');
  }

  suggest(options?: SuggestLinksOptions): LinkSuggestion[] {
    const threshold = options?.threshold ?? 0.7;
    const limit = options?.limit ?? 20;

    if (this.vectorIndex.size === 0) {
      return [];
    }

    // Get existing direct links as a set for fast lookup
    const { total: linkTotal } = this.db.links.count();
    const existingLinkPairs = new Set<string>();
    const allDocs = this.db.documents.findAll();

    for (const doc of allDocs) {
      const outlinks = this.db.links.findBySourceDocId(doc.id);
      for (const link of outlinks) {
        if (link.target_doc_id) {
          existingLinkPairs.add(`${doc.id}:${link.target_doc_id}`);
          existingLinkPairs.add(`${link.target_doc_id}:${doc.id}`);
        }
      }
    }

    // For each document's sections, find similar sections in other documents
    const suggestions: LinkSuggestion[] = [];
    const seenPairs = new Set<string>();

    for (const doc of allDocs) {
      const sections = this.db.sections.findByDocId(doc.id);

      for (const section of sections) {
        if (!section.embedding) continue;

        // Convert Buffer to Float32Array
        const embedding = new Float32Array(
          section.embedding.buffer,
          section.embedding.byteOffset,
          section.embedding.byteLength / 4,
        );

        // Find similar sections
        const similar = this.vectorIndex.search(embedding, 10);

        for (const match of similar) {
          // Skip same document
          if (match.docId === doc.id) continue;

          // Skip if already linked
          if (existingLinkPairs.has(`${doc.id}:${match.docId}`)) continue;

          // Skip if below threshold
          if (match.similarity < threshold) continue;

          // Skip if already suggested (avoid duplicates)
          const pairKey = [doc.id, match.docId].sort().join(':');
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);

          const targetDoc = this.db.documents.findById(match.docId);
          if (!targetDoc) continue;

          const targetSection = this.db.sections.findById(match.sectionId);

          suggestions.push({
            source_filepath: doc.filepath,
            target_filepath: targetDoc.filepath,
            similarity: match.similarity,
            source_section: section.heading ?? section.content.slice(0, 100),
            target_section: targetSection?.heading ?? targetSection?.content.slice(0, 100) ?? '',
          });
        }
      }
    }

    // Sort by similarity descending and take top limit
    suggestions.sort((a, b) => b.similarity - a.similarity);
    return suggestions.slice(0, limit);
  }
}
