import { describe, it, expect, beforeEach } from 'vitest';
import { VectorIndex } from './vector-index.js';

function makeNormalizedVector(dimension: number, seed: number): Float32Array {
  const vec = new Float32Array(dimension);
  let norm = 0;
  for (let i = 0; i < dimension; i++) {
    vec[i] = Math.sin(seed * (i + 1));
    norm += vec[i]! * vec[i]!;
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < dimension; i++) {
    vec[i] = vec[i]! / norm;
  }
  return vec;
}

describe('VectorIndex', () => {
  const DIM = 8; // Use small dimension for tests
  let index: VectorIndex;

  beforeEach(() => {
    index = new VectorIndex(DIM);
  });

  it('should start empty', () => {
    expect(index.size).toBe(0);
  });

  it('should upsert and search a single vector', () => {
    const vec = makeNormalizedVector(DIM, 1);
    index.upsert(1, 'doc-1', vec);
    expect(index.size).toBe(1);

    const results = index.search(vec, 5);
    expect(results.length).toBe(1);
    expect(results[0]!.sectionId).toBe(1);
    expect(results[0]!.similarity).toBeCloseTo(1.0, 3); // Self-similarity
  });

  it('should return results sorted by descending similarity', () => {
    const query = makeNormalizedVector(DIM, 1);
    const similar = makeNormalizedVector(DIM, 1.1); // Close to query
    const different = makeNormalizedVector(DIM, 5); // Different from query

    index.upsert(1, 'doc-1', similar);
    index.upsert(2, 'doc-2', different);

    const results = index.search(query, 5);
    expect(results.length).toBe(2);
    expect(results[0]!.similarity).toBeGreaterThan(results[1]!.similarity);
  });

  it('should respect topK limit', () => {
    for (let i = 0; i < 10; i++) {
      index.upsert(i, `doc-${i}`, makeNormalizedVector(DIM, i));
    }
    const results = index.search(makeNormalizedVector(DIM, 0), 3);
    expect(results.length).toBe(3);
  });

  it('should update existing entry on upsert with same sectionId', () => {
    const vec1 = makeNormalizedVector(DIM, 1);
    const vec2 = makeNormalizedVector(DIM, 2);
    index.upsert(1, 'doc-1', vec1);
    index.upsert(1, 'doc-1', vec2);
    expect(index.size).toBe(1);

    const results = index.search(vec2, 5);
    expect(results[0]!.similarity).toBeCloseTo(1.0, 3);
  });

  it('should remove entries by docId', () => {
    index.upsert(1, 'doc-1', makeNormalizedVector(DIM, 1));
    index.upsert(2, 'doc-1', makeNormalizedVector(DIM, 2));
    index.upsert(3, 'doc-2', makeNormalizedVector(DIM, 3));
    expect(index.size).toBe(3);

    index.removeByDocId('doc-1');
    expect(index.size).toBe(1);

    const results = index.search(makeNormalizedVector(DIM, 3), 5);
    expect(results.length).toBe(1);
    expect(results[0]!.docId).toBe('doc-2');
  });

  it('should remove entry by sectionId', () => {
    index.upsert(1, 'doc-1', makeNormalizedVector(DIM, 1));
    index.upsert(2, 'doc-1', makeNormalizedVector(DIM, 2));
    expect(index.size).toBe(2);

    index.removeBySectionId(1);
    expect(index.size).toBe(1);
  });

  it('should compact after removing 20% of entries', () => {
    for (let i = 0; i < 10; i++) {
      index.upsert(i, `doc-${i}`, makeNormalizedVector(DIM, i));
    }
    expect(index.totalAllocated).toBe(10);

    // Remove 2 out of 10 = 20%, triggers auto-compact
    index.removeBySectionId(0);
    index.removeBySectionId(1);

    expect(index.size).toBe(8);
    expect(index.totalAllocated).toBe(8); // Compacted
  });

  it('should reject vectors with wrong dimension', () => {
    const wrongDim = new Float32Array(DIM + 1);
    expect(() => index.upsert(1, 'doc-1', wrongDim)).toThrow(
      'dimension mismatch',
    );
  });

  it('should reject query vectors with wrong dimension', () => {
    const wrongDim = new Float32Array(DIM + 1);
    expect(() => index.search(wrongDim)).toThrow('dimension mismatch');
  });

  it('should handle empty index search', () => {
    const query = makeNormalizedVector(DIM, 1);
    const results = index.search(query);
    expect(results).toEqual([]);
  });

  it('should compact explicitly', () => {
    index.upsert(1, 'doc-1', makeNormalizedVector(DIM, 1));
    index.upsert(2, 'doc-2', makeNormalizedVector(DIM, 2));
    index.upsert(3, 'doc-3', makeNormalizedVector(DIM, 3));

    // Manual null-out via removeByDocId won't auto-compact if < 20%
    // but explicit compact should still work
    index.compact();
    expect(index.size).toBe(3);
    expect(index.totalAllocated).toBe(3);
  });
});
