/**
 * 非同期 Embedding キュー
 *
 * パース・DB 更新（同期）と Embedding 生成（非同期）の境界を管理する。
 * embedBatch() を活用しバッチ処理でスループットを確保する。
 *
 * - enqueue でセクション ID をキューに追加
 * - バックグラウンドで BATCH_SIZE 単位でまとめて処理
 * - エラー時はスキップして次に進む（フォールト・トレランス）
 */

import type { EmbeddingProvider, EmbeddingResult } from '../../embedding/provider.js';
import { EmbeddingError } from '../../shared/errors.js';

const BATCH_SIZE = 32;

/** キュー内のジョブ */
export interface EmbeddingJob {
  sectionId: number;
  docId: string;
  content: string;
  heading: string | null;
}

/** Embedding 結果の保存先インターフェース */
export interface EmbeddingStore {
  /** セクションの embedding を更新する */
  updateEmbedding(
    sectionId: number,
    embedding: Float32Array,
    model: string,
  ): void;
}

/** VectorIndex 更新用インターフェース */
export interface VectorIndexUpdater {
  /** ベクトルを追加/更新する */
  set(sectionId: number, embedding: Float32Array): void;
}

export type EmbeddingQueueEventType =
  | 'job:complete'
  | 'job:error'
  | 'queue:empty'
  | 'queue:progress';

export type EmbeddingQueueListener = (
  event: EmbeddingQueueEventType,
  data?: unknown,
) => void;

export class EmbeddingQueue {
  private queue: EmbeddingJob[] = [];
  private processing = false;
  private stopped = true;
  private completedCount = 0;
  private totalEnqueued = 0;
  private listeners: EmbeddingQueueListener[] = [];
  private drainResolvers: Array<() => void> = [];

  constructor(
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly store: EmbeddingStore,
    private readonly vectorIndex: VectorIndexUpdater,
  ) {}

  /**
   * セクション ID をキューに追加する。
   * 既に同じ sectionId のジョブがキューにある場合は上書きする。
   */
  enqueue(jobs: EmbeddingJob[]): void {
    for (const job of jobs) {
      const existingIndex = this.queue.findIndex(
        (j) => j.sectionId === job.sectionId,
      );
      if (existingIndex >= 0) {
        this.queue[existingIndex] = job;
      } else {
        this.queue.push(job);
        this.totalEnqueued++;
      }
    }

    // キュー開始済みなら処理を継続
    if (!this.stopped) {
      void this.processLoop();
    }
  }

  /** キュー処理を開始する */
  start(): void {
    this.stopped = false;
    void this.processLoop();
  }

  /** キュー処理を停止する。現在処理中のバッチ完了を待つ。 */
  async stop(): Promise<void> {
    this.stopped = true;
    // processing が false になるまで待つ
    if (this.processing) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!this.processing) {
            resolve();
          } else {
            setTimeout(check, 50);
          }
        };
        check();
      });
    }
  }

  /** 未処理キューのサイズ */
  get pendingCount(): number {
    return this.queue.length;
  }

  /** 処理済みジョブ数 */
  get completedJobCount(): number {
    return this.completedCount;
  }

  /** キュー内の全ジョブの完了を待つ */
  async drain(): Promise<void> {
    if (this.queue.length === 0 && !this.processing) return;
    return new Promise<void>((resolve) => {
      this.drainResolvers.push(resolve);
    });
  }

  /** イベントリスナーを登録する */
  on(listener: EmbeddingQueueListener): void {
    this.listeners.push(listener);
  }

  /** イベントリスナーを除去する */
  off(listener: EmbeddingQueueListener): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /** キューをクリアする */
  clear(): void {
    this.queue = [];
    this.completedCount = 0;
    this.totalEnqueued = 0;
  }

  // --- private ---

  private emit(event: EmbeddingQueueEventType, data?: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data);
      } catch {
        // リスナーのエラーは無視
      }
    }
  }

  private async processLoop(): Promise<void> {
    if (this.processing || this.stopped) return;

    this.processing = true;

    try {
      while (this.queue.length > 0 && !this.stopped) {
        // バッチサイズ分をキューから取り出し
        const batch = this.queue.splice(0, BATCH_SIZE);
        await this.processBatch(batch);
      }
    } finally {
      this.processing = false;

      if (this.queue.length === 0) {
        this.emit('queue:empty');
        // drain 待ちを解決
        for (const resolve of this.drainResolvers) {
          resolve();
        }
        this.drainResolvers = [];
      }
    }
  }

  private async processBatch(batch: EmbeddingJob[]): Promise<void> {
    // Embedding 用テキストを構築（見出し + 内容）
    const texts = batch.map((job) =>
      job.heading ? `${job.heading}\n${job.content}` : job.content,
    );

    let results: Array<EmbeddingResult | null>;
    try {
      results = await this.embeddingProvider.embedBatch(texts);
    } catch (err) {
      // バッチ全体が失敗した場合、個別に再試行
      results = await this.processIndividually(batch, texts);
    }

    // 結果を保存
    for (let i = 0; i < batch.length; i++) {
      const job = batch[i]!;
      const result = results[i];

      if (!result) {
        this.emit('job:error', {
          sectionId: job.sectionId,
          error: new EmbeddingError('No result returned for section'),
        });
        continue;
      }

      try {
        // DB に保存
        this.store.updateEmbedding(job.sectionId, result.vector, result.model);
        // VectorIndex に追加
        this.vectorIndex.set(job.sectionId, result.vector);

        this.completedCount++;
        this.emit('job:complete', { sectionId: job.sectionId });
        this.emit('queue:progress', {
          completed: this.completedCount,
          total: this.totalEnqueued,
        });
      } catch (err) {
        this.emit('job:error', {
          sectionId: job.sectionId,
          error: err instanceof Error ? err : new Error(String(err)),
        });
      }
    }
  }

  /** バッチ失敗時の個別フォールバック処理 */
  private async processIndividually(
    batch: EmbeddingJob[],
    texts: string[],
  ): Promise<Array<EmbeddingResult | null>> {
    const results: Array<EmbeddingResult | null> = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const result = await this.embeddingProvider.embed(texts[i]!);
        results.push(result);
      } catch (err) {
        this.emit('job:error', {
          sectionId: batch[i]!.sectionId,
          error: err instanceof Error ? err : new Error(String(err)),
        });
        results.push(null);
      }
    }

    return results;
  }
}
