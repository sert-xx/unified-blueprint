import type Database from 'better-sqlite3';
import type { VectorEntry, VectorSearchResult } from './types.js';

/**
 * 正規化済みベクトルの内積でコサイン類似度を計算する。
 * 前提: 入力ベクトルは正規化済み（||a|| = ||b|| = 1）。
 * cos(A, B) = A . B（内積のみでOK）
 */
function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

/**
 * インメモリベクトル検索インデックス
 * Float32Array のブルートフォースコサイン類似度検索
 */
export class VectorIndex {
  private entries: (VectorEntry | null)[] = [];
  private sectionIdMap: Map<number, number> = new Map();
  private dimension: number;
  private nullCount = 0;

  constructor(dimension: number = 0) {
    this.dimension = dimension;
  }

  /**
   * DB起動時: sections テーブルから embedding が非NULL のレコードを全ロードする
   */
  loadFromDatabase(db: Database.Database): void {
    const rows = db
      .prepare(
        `SELECT id, doc_id, embedding FROM sections WHERE embedding IS NOT NULL`,
      )
      .all() as Array<{ id: number; doc_id: string; embedding: Buffer }>;

    this.entries = [];
    this.sectionIdMap.clear();
    this.nullCount = 0;

    for (const row of rows) {
      const embedding = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        row.embedding.byteLength / 4,
      );

      // 最初のエントリから次元数を自動検出
      if (this.dimension === 0) {
        this.dimension = embedding.length;
      }

      const index = this.entries.length;
      this.entries.push({
        sectionId: row.id,
        docId: row.doc_id,
        embedding,
      });
      this.sectionIdMap.set(row.id, index);
    }
  }

  /**
   * 単一セクションのベクトルを追加または更新する
   */
  upsert(sectionId: number, docId: string, embedding: Float32Array): void {
    // 最初の upsert で次元数を確定
    if (this.dimension === 0) {
      this.dimension = embedding.length;
    }
    if (embedding.length !== this.dimension) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.dimension}, got ${embedding.length}`,
      );
    }

    const existingIndex = this.sectionIdMap.get(sectionId);
    if (existingIndex !== undefined) {
      this.entries[existingIndex] = { sectionId, docId, embedding };
    } else {
      const index = this.entries.length;
      this.entries.push({ sectionId, docId, embedding });
      this.sectionIdMap.set(sectionId, index);
    }
  }

  /**
   * ドキュメント削除時: 該当 doc_id のエントリを全て削除する（遅延削除）
   */
  removeByDocId(docId: string): void {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (entry != null && entry.docId === docId) {
        this.sectionIdMap.delete(entry.sectionId);
        this.entries[i] = null;
        this.nullCount++;
      }
    }
    this.maybeCompact();
  }

  /**
   * セクションID指定で単一エントリを削除する
   */
  removeBySectionId(sectionId: number): void {
    const index = this.sectionIdMap.get(sectionId);
    if (index !== undefined) {
      this.entries[index] = null;
      this.sectionIdMap.delete(sectionId);
      this.nullCount++;
      this.maybeCompact();
    }
  }

  /**
   * ブルートフォースコサイン類似度検索
   */
  search(queryEmbedding: Float32Array, topK: number = 5): VectorSearchResult[] {
    if (this.dimension > 0 && queryEmbedding.length !== this.dimension) {
      throw new Error(
        `Query embedding dimension mismatch: expected ${this.dimension}, got ${queryEmbedding.length}`,
      );
    }

    const results: VectorSearchResult[] = [];

    for (const entry of this.entries) {
      if (entry === null) continue;
      const similarity = dotProduct(queryEmbedding, entry.embedding);
      results.push({
        sectionId: entry.sectionId,
        docId: entry.docId,
        similarity,
      });
    }

    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  /**
   * null 化されたエントリを除去し、配列を圧縮する
   */
  compact(): void {
    const newEntries: VectorEntry[] = [];
    this.sectionIdMap.clear();
    for (const entry of this.entries) {
      if (entry !== null) {
        this.sectionIdMap.set(entry.sectionId, newEntries.length);
        newEntries.push(entry);
      }
    }
    this.entries = newEntries;
    this.nullCount = 0;
  }

  /**
   * エントリ数の20%以上がnullの場合に自動コンパクション
   */
  private maybeCompact(): void {
    if (this.entries.length > 0 && this.nullCount / this.entries.length >= 0.2) {
      this.compact();
    }
  }

  get size(): number {
    return this.sectionIdMap.size;
  }

  get totalAllocated(): number {
    return this.entries.length;
  }
}
