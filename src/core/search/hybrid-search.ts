/**
 * Graph-Aware Hybrid Search
 *
 * Combines vector similarity, graph proximity, and FTS5 relevance for ranking:
 *   final_score = alpha * vector_similarity + beta * graph_proximity + gamma * fts5_score
 *   where alpha + beta + gamma = 1.0
 *
 * Search flow:
 *   1. EmbeddingProvider.embed(query) -> query vector
 *   2. VectorIndex.search(queryVector, limit*10) -> vector candidates
 *   3. FulltextSearch.search(query) -> FTS5 candidates
 *   4. From top vector hits, graph traversal (depth=config.search.max_depth)
 *   5. graph_proximity = 1 / hop_distance (1-hop: 1.0, 2-hop: 0.5, 3-hop: 0.33)
 *   6. fts5_score = normalized FTS5 rank (0.0-1.0)
 *   7. final_score = alpha * vector_similarity + beta * graph_proximity + gamma * fts5_score
 *   8. Re-rank and return top limit results
 *
 * Falls back to FTS5 when embedding index is empty.
 */

import type { EmbeddingProvider } from '../../embedding/provider.js';
import type { UbpConfig } from '../../config/types.js';
import type { DatabaseManager } from '../../data/database-manager.js';
import type {
  SearchInput,
  SearchOutput,
  SearchResult,
  SectionMatch,
  StalenessLevel,
} from '../../shared/types.js';
import { VectorSearch } from './vector-search.js';
import { FulltextSearch } from './fulltext-search.js';
import { GraphTraversal } from '../graph/graph-traversal.js';
import { GraphScorer } from '../graph/graph-scorer.js';
import { StalenessDetector } from '../staleness/staleness-detector.js';
import { createLogger, type Logger } from '../../shared/logger.js';

export interface HybridSearchDeps {
  config: UbpConfig;
  db: DatabaseManager;
  embeddingProvider: EmbeddingProvider;
  vectorSearch: VectorSearch;
  fulltextSearch: FulltextSearch;
  graphTraversal: GraphTraversal;
  graphScorer: GraphScorer;
  stalenessDetector: StalenessDetector;
}

export class HybridSearch {
  private readonly config: UbpConfig;
  private readonly db: DatabaseManager;
  private readonly embeddingProvider: EmbeddingProvider;
  private readonly vectorSearch: VectorSearch;
  private readonly fulltextSearch: FulltextSearch;
  private readonly graphTraversal: GraphTraversal;
  private readonly graphScorer: GraphScorer;
  private readonly stalenessDetector: StalenessDetector;
  private readonly logger: Logger;

  constructor(deps: HybridSearchDeps) {
    this.config = deps.config;
    this.db = deps.db;
    this.embeddingProvider = deps.embeddingProvider;
    this.vectorSearch = deps.vectorSearch;
    this.fulltextSearch = deps.fulltextSearch;
    this.graphTraversal = deps.graphTraversal;
    this.graphScorer = deps.graphScorer;
    this.stalenessDetector = deps.stalenessDetector;
    this.logger = createLogger('HybridSearch');
  }

  async search(input: SearchInput): Promise<SearchOutput> {
    const limit = input.limit ?? this.config.search.default_limit;

    // Fall back to FTS5 if vector index is empty
    if (this.vectorSearch.isEmpty) {
      this.logger.info('Vector index empty, falling back to fulltext search');
      return this.fulltextFallback(input, limit);
    }

    try {
      return await this.hybridSearch(input, limit);
    } catch (err) {
      this.logger.error('Hybrid search failed, falling back to FTS5:', String(err));
      return this.fulltextFallback(input, limit);
    }
  }

  private async hybridSearch(
    input: SearchInput,
    limit: number,
  ): Promise<SearchOutput> {
    const alpha = this.config.search.alpha;
    const maxDepth = input.depth ?? this.config.search.max_depth;

    // Step 1: Generate query embedding (embedQuery があれば検索用プレフィックスを適用)
    const queryResult = this.embeddingProvider.embedQuery
      ? await this.embeddingProvider.embedQuery(input.query)
      : await this.embeddingProvider.embed(input.query);
    const queryVector = queryResult.vector;

    // Step 2: Vector search with expanded candidate set
    const candidateCount = limit * 10;
    const vectorResults = this.vectorSearch.search(queryVector, candidateCount);

    if (vectorResults.length === 0) {
      return this.fulltextFallback(input, limit);
    }

    // Step 2.5: FTS5 search for keyword signal
    const ftsResults = this.fulltextSearch.search(input.query, candidateCount);
    const ftsScoreMap = new Map<string, number>();
    if (ftsResults.length > 0) {
      // FTS5 rank は負の値（小さいほど良い）なので正規化して 0.0-1.0 にする
      const maxRank = Math.max(...ftsResults.map((r) => Math.abs(r.rank)));
      for (const fts of ftsResults) {
        const normalized = maxRank > 0 ? Math.abs(fts.rank) / maxRank : 0;
        const existing = ftsScoreMap.get(fts.docId);
        if (existing === undefined || normalized > existing) {
          ftsScoreMap.set(fts.docId, normalized);
        }
      }
    }

    // Step 3: Graph traversal from top vector hits
    // Use unique doc IDs from top vector hits
    const topDocIds = new Set<string>();
    const topHitCount = Math.min(limit * 2, vectorResults.length);
    for (let i = 0; i < topHitCount; i++) {
      topDocIds.add(vectorResults[i]!.docId);
    }

    // Traverse graph from each top-hit document
    const linkTypeFilter = input.link_types
      ? new Set(input.link_types)
      : null;
    const allGraphNodes = new Map<string, number>(); // docId -> min depth
    for (const docId of topDocIds) {
      const nodes = this.graphTraversal.traverse(docId, maxDepth);
      for (const node of nodes) {
        // Filter by link_types if specified
        if (linkTypeFilter && !linkTypeFilter.has(node.linkType as import('../../shared/types.js').LinkType)) {
          continue;
        }
        const existing = allGraphNodes.get(node.docId);
        if (existing === undefined || node.depth < existing) {
          allGraphNodes.set(node.docId, node.depth);
        }
      }
    }

    // Step 4: Compute graph_proximity scores
    const graphProximityMap = new Map<string, number>();
    for (const [docId, depth] of allGraphNodes) {
      graphProximityMap.set(docId, depth > 0 ? 1.0 / depth : 0);
    }
    // Top vector hits themselves get proximity 1.0
    for (const docId of topDocIds) {
      const existing = graphProximityMap.get(docId);
      if (existing === undefined || 1.0 > existing) {
        graphProximityMap.set(docId, 1.0);
      }
    }

    // Step 5: Aggregate scores per document
    // Group vector results by document
    const docScores = new Map<
      string,
      {
        maxVectorSimilarity: number;
        sectionMatches: Array<{
          sectionId: number;
          similarity: number;
        }>;
      }
    >();

    for (const vr of vectorResults) {
      let entry = docScores.get(vr.docId);
      if (!entry) {
        entry = { maxVectorSimilarity: 0, sectionMatches: [] };
        docScores.set(vr.docId, entry);
      }
      if (vr.similarity > entry.maxVectorSimilarity) {
        entry.maxVectorSimilarity = vr.similarity;
      }
      entry.sectionMatches.push({
        sectionId: vr.sectionId,
        similarity: vr.similarity,
      });
    }

    // Also include graph-connected documents that weren't in vector results
    for (const [docId] of allGraphNodes) {
      if (!docScores.has(docId)) {
        docScores.set(docId, { maxVectorSimilarity: 0, sectionMatches: [] });
      }
    }

    // Step 6: Compute final scores with three signals
    // alpha: vector weight (config), beta: graph weight, gamma: FTS5 weight
    // FTS5 がヒットした場合は alpha を按分して gamma に割り当て
    const hasFtsHits = ftsScoreMap.size > 0;
    const gamma = hasFtsHits ? (1 - alpha) * 0.3 : 0; // FTS5 weight (graph の 30% を割譲)
    const beta = (1 - alpha) - gamma; // graph weight (残り)

    const scoredDocs: Array<{
      docId: string;
      finalScore: number;
      vectorSimilarity: number;
      graphProximity: number;
      ftsScore: number;
      sectionMatches: Array<{ sectionId: number; similarity: number }>;
    }> = [];

    for (const [docId, entry] of docScores) {
      // セクション集約: max だけでなく上位セクションの平均も加味
      // 複数セクションが関連するドキュメントを優遇する
      let vectorSimilarity = entry.maxVectorSimilarity;
      if (entry.sectionMatches.length > 1) {
        const sorted = entry.sectionMatches
          .map((s) => s.similarity)
          .sort((a, b) => b - a);
        const topN = sorted.slice(0, Math.min(3, sorted.length));
        const avgTop = topN.reduce((sum, s) => sum + s, 0) / topN.length;
        // max * 0.8 + avgTop * 0.2: 複数セクションの一貫した関連性をボーナス
        vectorSimilarity = entry.maxVectorSimilarity * 0.8 + avgTop * 0.2;
      }
      const graphProximity = graphProximityMap.get(docId) ?? 0;
      const ftsScore = ftsScoreMap.get(docId) ?? 0;
      const finalScore = alpha * vectorSimilarity + beta * graphProximity + gamma * ftsScore;

      scoredDocs.push({
        docId,
        finalScore,
        vectorSimilarity,
        graphProximity,
        ftsScore,
        sectionMatches: entry.sectionMatches,
      });
    }

    // Sort by final score descending
    scoredDocs.sort((a, b) => b.finalScore - a.finalScore);

    // Filter by doc_type if specified
    let filteredDocs = scoredDocs;
    if (input.doc_type) {
      filteredDocs = scoredDocs.filter((sd) => {
        const doc = this.db.documents.findById(sd.docId);
        return doc?.doc_type === input.doc_type;
      });
    }

    // Take top limit
    const topDocs = filteredDocs.slice(0, limit);

    // Build SearchResult objects
    const results: SearchResult[] = [];
    for (const scored of topDocs) {
      const doc = this.db.documents.findById(scored.docId);
      if (!doc) continue;

      // Build section matches
      const sectionMatches: SectionMatch[] = [];
      for (const sm of scored.sectionMatches.slice(0, 3)) {
        const section = this.db.sections.findById(sm.sectionId);
        if (section) {
          sectionMatches.push({
            section_id: sm.sectionId,
            heading: section.heading,
            content: section.content,
            score: sm.similarity,
          });
        }
      }

      // If no section matches from vector search, find sections from the document
      if (sectionMatches.length === 0) {
        const docSections = this.db.sections.findByDocId(scored.docId);
        if (docSections.length > 0) {
          sectionMatches.push({
            section_id: docSections[0]!.id,
            heading: docSections[0]!.heading,
            content: docSections[0]!.content.slice(0, 500),
            score: 0,
          });
        }
      }

      const staleness = this.stalenessDetector.getStaleness(doc.id);

      // Build relevance reason
      const reasons: string[] = [];
      if (scored.vectorSimilarity > 0) {
        reasons.push(`vector similarity: ${scored.vectorSimilarity.toFixed(3)}`);
      }
      if (scored.graphProximity > 0) {
        reasons.push(`graph proximity: ${scored.graphProximity.toFixed(3)}`);
      }
      if (scored.ftsScore > 0) {
        reasons.push(`fulltext: ${scored.ftsScore.toFixed(3)}`);
      }

      results.push({
        doc_id: doc.id,
        filepath: doc.filepath,
        title: doc.title,
        sections: sectionMatches,
        score: scored.finalScore,
        score_breakdown: {
          vector_similarity: scored.vectorSimilarity,
          graph_proximity: scored.graphProximity,
        },
        relevance_reason: reasons.join(', ') || 'graph-connected',
        staleness,
      });
    }

    return {
      results,
      total_found: filteredDocs.length,
      search_type: 'hybrid',
    };
  }

  private fulltextFallback(input: SearchInput, limit: number): SearchOutput {
    const ftsResults = this.fulltextSearch.search(input.query, limit * 2);

    // Filter by doc_type if specified
    let filtered = ftsResults;
    if (input.doc_type) {
      filtered = ftsResults.filter((r) => r.docType === input.doc_type);
    }

    const results: SearchResult[] = [];
    const seen = new Set<string>();

    for (const fts of filtered.slice(0, limit)) {
      if (seen.has(fts.docId)) continue;
      seen.add(fts.docId);

      const doc = this.db.documents.findById(fts.docId);
      if (!doc) continue;

      const staleness = this.stalenessDetector.getStaleness(doc.id);

      results.push({
        doc_id: doc.id,
        filepath: doc.filepath,
        title: doc.title,
        sections: [
          {
            section_id: fts.sectionId,
            heading: fts.heading,
            content: fts.snippet,
            score: Math.abs(fts.rank),
          },
        ],
        score: Math.abs(fts.rank),
        score_breakdown: {
          vector_similarity: 0,
          graph_proximity: 0,
        },
        relevance_reason: 'fulltext match',
        staleness,
      });
    }

    return {
      results,
      total_found: results.length,
      search_type: 'fulltext_fallback',
    };
  }
}
