import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DatabaseManager } from '../../data/database-manager.js';
import { HybridSearch } from './hybrid-search.js';
import { VectorSearch } from './vector-search.js';
import { FulltextSearch } from './fulltext-search.js';
import { GraphTraversal } from '../graph/graph-traversal.js';
import { GraphScorer } from '../graph/graph-scorer.js';
import { StalenessDetector } from '../staleness/staleness-detector.js';
import { hashString } from '../../shared/hash.js';
import type { EmbeddingProvider, EmbeddingResult } from '../../embedding/provider.js';
import type { UbpConfig } from '../../config/types.js';
import { DEFAULT_CONFIG } from '../../config/types.js';

const DIM = 384; // must match VectorIndex default dimension

function makeEmbedding(...values: number[]): Float32Array {
  const arr = new Float32Array(DIM);
  for (let i = 0; i < values.length && i < DIM; i++) {
    arr[i] = values[i]!;
  }
  // Fill remaining with small random-ish values for normalization
  return arr;
}

function normalize(v: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i]! * v[i]!;
  const mag = Math.sqrt(sum);
  const result = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) result[i] = v[i]! / mag;
  return result;
}

function createMockEmbeddingProvider(
  queryVector: Float32Array,
): EmbeddingProvider {
  return {
    async initialize() {},
    async embed(): Promise<EmbeddingResult> {
      return {
        vector: queryVector,
        model: 'test-model',
        dimensions: DIM,
      };
    },
    async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
      return texts.map(() => ({
        vector: queryVector,
        model: 'test-model',
        dimensions: DIM,
      }));
    },
    getModelInfo() {
      return { name: 'test-model', dimensions: DIM, maxTokens: 256, languages: ['en'] };
    },
    async dispose() {},
  };
}

describe('HybridSearch', () => {
  let tmpDir: string;
  let db: DatabaseManager;
  let config: UbpConfig;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubp-hybrid-test-'));
    const dbPath = path.join(tmpDir, 'test.db');
    db = new DatabaseManager({ dbPath });
    db.initialize();
    config = {
      ...DEFAULT_CONFIG,
      search: { alpha: 0.7, default_limit: 10, max_depth: 2 },
    };
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function insertDocWithSection(
    docId: string,
    filepath: string,
    title: string,
    content: string,
    embedding: Float32Array,
  ): void {
    db.documents.upsert({
      id: docId,
      filepath,
      title,
      doc_type: 'spec',
      body_hash: hashString(content),
    });
    db.sections.replaceByDocId(docId, [
      {
        doc_id: docId,
        heading: title,
        section_order: 0,
        content,
        content_hash: hashString(content),
        token_count: null,
      },
    ]);
    // Get inserted section id
    const sections = db.sections.findByDocId(docId);
    const sec = sections[0]!;
    // Store embedding in DB and vector index
    const buffer = Buffer.from(
      embedding.buffer,
      embedding.byteOffset,
      embedding.byteLength,
    );
    db.sections.updateEmbedding(sec.id, buffer, 'test-model');
    db.getVectorIndex().upsert(sec.id, docId, embedding);
  }

  function insertLink(
    sourceDocId: string,
    targetDocId: string,
    type: 'references' | 'depends_on' = 'references',
  ): void {
    db.links.replaceBySourceDocId(sourceDocId, [
      {
        source_doc_id: sourceDocId,
        target_doc_id: targetDocId,
        type,
        context: null,
        source_section_id: null,
        target_title: null,
      },
    ]);
  }

  function createHybridSearch(queryVector: Float32Array): HybridSearch {
    const vectorIndex = db.getVectorIndex();
    return new HybridSearch({
      config,
      db,
      embeddingProvider: createMockEmbeddingProvider(queryVector),
      vectorSearch: new VectorSearch(vectorIndex),
      fulltextSearch: new FulltextSearch(db.fulltext),
      graphTraversal: new GraphTraversal(db.graph),
      graphScorer: new GraphScorer(),
      stalenessDetector: new StalenessDetector(db, config, tmpDir),
    });
  }

  it('falls back to fulltext when vector index is empty', async () => {
    // Insert doc without embedding
    db.documents.upsert({
      id: 'doc-1',
      filepath: 'test.md',
      title: 'Test Doc',
      doc_type: 'spec',
      body_hash: hashString('hello world'),
    });
    db.sections.replaceByDocId('doc-1', [
      {
        doc_id: 'doc-1',
        heading: 'Test',
        section_order: 0,
        content: 'hello world testing',
        content_hash: hashString('hello world testing'),
        token_count: null,
      },
    ]);

    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'hello' });

    expect(result.search_type).toBe('fulltext_fallback');
  });

  it('performs hybrid search combining vector and graph scores', async () => {
    // Create 3 docs: A, B (linked to A), C (not linked)
    const vecA = normalize(makeEmbedding(1, 0, 0, 0));
    const vecB = normalize(makeEmbedding(0.9, 0.1, 0, 0));
    const vecC = normalize(makeEmbedding(0.1, 0.9, 0, 0));

    insertDocWithSection('doc-a', 'a.md', 'Doc A', 'alpha content', vecA);
    insertDocWithSection('doc-b', 'b.md', 'Doc B', 'beta content', vecB);
    insertDocWithSection('doc-c', 'c.md', 'Doc C', 'gamma content', vecC);

    // A -> B link
    insertLink('doc-a', 'doc-b');

    // Query vector close to A
    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'alpha', limit: 10 });

    expect(result.search_type).toBe('hybrid');
    expect(result.results.length).toBeGreaterThanOrEqual(2);

    // Doc A should be ranked first (highest vector similarity)
    expect(result.results[0]!.doc_id).toBe('doc-a');

    // Each result should have score breakdown
    for (const r of result.results) {
      expect(r.score_breakdown).toBeDefined();
      expect(typeof r.score_breakdown.vector_similarity).toBe('number');
      expect(typeof r.score_breakdown.graph_proximity).toBe('number');
    }
  });

  it('includes graph-connected documents in results even with low vector similarity', async () => {
    // A has high similarity, B is linked to A but not in vector results
    const vecA = normalize(makeEmbedding(1, 0, 0, 0));
    // B is orthogonal to query - low vector similarity
    const vecB = normalize(makeEmbedding(0, 1, 0, 0));

    insertDocWithSection('doc-a', 'a.md', 'Doc A', 'main doc', vecA);
    insertDocWithSection('doc-b', 'b.md', 'Doc B', 'linked doc', vecB);

    // A -> B link
    insertLink('doc-a', 'doc-b');

    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'main', limit: 10 });

    // Both A and B should be in results
    const resultA = result.results.find((r) => r.doc_id === 'doc-a');
    const resultB = result.results.find((r) => r.doc_id === 'doc-b');

    expect(resultA).toBeDefined();
    // B should appear through graph connection
    expect(resultB).toBeDefined();
    if (resultB) {
      // B has graph_proximity > 0 because it's linked to A
      expect(resultB.score_breakdown.graph_proximity).toBeGreaterThan(0);
    }
  });

  it('applies alpha weighting correctly', async () => {
    const vecA = normalize(makeEmbedding(1, 0, 0, 0));
    insertDocWithSection('doc-a', 'a.md', 'Doc A', 'content', vecA);

    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'content', limit: 1 });

    expect(result.results.length).toBe(1);
    const r = result.results[0]!;

    // final_score = alpha * vector_sim + (1-alpha) * graph_prox
    const expectedScore =
      config.search.alpha * r.score_breakdown.vector_similarity +
      (1 - config.search.alpha) * r.score_breakdown.graph_proximity;
    expect(r.score).toBeCloseTo(expectedScore, 4);
  });

  it('includes staleness info in results', async () => {
    const vecA = normalize(makeEmbedding(1, 0, 0, 0));
    insertDocWithSection('doc-a', 'a.md', 'Doc A', 'content', vecA);

    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'content' });

    expect(result.results[0]!.staleness).toBeDefined();
    // No source_refs -> should be 'fresh'
    expect(result.results[0]!.staleness).toBe('fresh');
  });

  it('respects the limit parameter', async () => {
    // Insert many documents
    for (let i = 0; i < 5; i++) {
      const vec = normalize(makeEmbedding(1, i * 0.1, 0, 0));
      insertDocWithSection(
        `doc-${i}`,
        `doc${i}.md`,
        `Doc ${i}`,
        `content ${i}`,
        vec,
      );
    }

    const queryVec = normalize(makeEmbedding(1, 0, 0, 0));
    const search = createHybridSearch(queryVec);
    const result = await search.search({ query: 'content', limit: 2 });

    expect(result.results.length).toBe(2);
  });
});
