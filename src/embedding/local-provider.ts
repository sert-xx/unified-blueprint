/**
 * ローカル Embedding プロバイダー
 *
 * transformers.js (ONNX Runtime) を使用してローカルで Embedding を生成する。
 * @huggingface/transformers (v3) を優先し、@xenova/transformers (v2) にフォールバックする。
 * optionalDependency のため動的 import を使用し、利用不可時はエラーを返す。
 */

import type {
  EmbeddingProvider,
  EmbeddingResult,
  EmbeddingModelInfo,
} from './provider.js';
import { EmbeddingError, EmbeddingModelNotAvailableError } from '../shared/errors.js';
import { ModelManager } from './model-manager.js';

/** ローカルプロバイダーの設定 */
export interface LocalProviderConfig {
  /** モデル名（例: "Xenova/all-MiniLM-L6-v2"） */
  modelName?: string;
  /** モデルキャッシュディレクトリ */
  cacheDir?: string;
  /** 量子化モデルを使用するか */
  quantized?: boolean;
  /** 量子化タイプ（v3用: "q8", "q4", "fp32"） */
  dtype?: string;
}

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const DEFAULT_DIMENSIONS = 384;
const MAX_INPUT_TOKENS = 256;
const MAX_CHARS = 2048; // e5-large の最大512トークンを十分に活用する
const BATCH_SIZE = 32;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  private readonly modelName: string;
  private readonly modelManager: ModelManager;
  private readonly quantized: boolean;
  private readonly dtype?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractor: any = null;
  private _ready = false;
  private _detectedDimensions: number | null = null;
  private _pooling: string = 'mean';
  private _queryPrefix: string = '';
  private _passagePrefix: string = '';

  constructor(config?: LocalProviderConfig) {
    this.modelName = config?.modelName ?? DEFAULT_MODEL;
    this.modelManager = new ModelManager({ cacheDir: config?.cacheDir });
    this.quantized = config?.quantized ?? true;
    this.dtype = config?.dtype;
  }

  async initialize(): Promise<void> {
    this.modelManager.ensureCacheDir();

    try {
      const { pipeline, env } = await this.importTransformers();

      // Node.js 環境用設定
      env.cacheDir = this.modelManager.getCacheDir();

      // v3 では dtype オプション、v2 では quantized オプションを使用
      const pipelineOptions: Record<string, unknown> = {};
      if (this.dtype) {
        pipelineOptions.dtype = this.dtype;
      } else {
        pipelineOptions.quantized = this.quantized;
      }

      this.extractor = await pipeline('feature-extraction', this.modelName, pipelineOptions);

      // モデル名に基づいて pooling 戦略とプレフィックスを選択
      const lowerName = this.modelName.toLowerCase();
      if (lowerName.includes('bge')) {
        this._pooling = 'cls';
      } else {
        this._pooling = 'mean';
      }

      // instruction-tuned モデルの検出とプレフィックス設定
      if (lowerName.includes('e5-')) {
        this._queryPrefix = 'query: ';
        this._passagePrefix = 'passage: ';
      }

      // 初回 embed で次元数を検出
      const probe = await this.extractor!('test', {
        pooling: this._pooling,
        normalize: true,
      });
      this._detectedDimensions = new Float32Array(probe.data).length;

      this._ready = true;
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') ||
          err.message.includes('MODULE_NOT_FOUND'))
      ) {
        throw new EmbeddingModelNotAvailableError(
          this.modelName,
          new Error(
            'transformers.js is not installed. Install with: npm install @huggingface/transformers',
          ),
        );
      }
      throw new EmbeddingModelNotAvailableError(
        this.modelName,
        err instanceof Error ? err : new Error(String(err)),
      );
    }
  }

  /**
   * @huggingface/transformers (v3) を優先し、@xenova/transformers (v2) にフォールバック
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async importTransformers(): Promise<any> {
    try {
      return await import('@huggingface/transformers');
    } catch {
      return await import('@xenova/transformers');
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    this.ensureReady();

    const prefixed = this._passagePrefix + text;
    const truncated = this.truncateText(prefixed);
    const output = await this.extractor!(truncated, {
      pooling: this._pooling,
      normalize: true,
    });

    const vector = new Float32Array(output.data);
    return {
      vector,
      model: this.modelName,
      dimensions: vector.length,
    };
  }

  async embedQuery(text: string): Promise<EmbeddingResult> {
    this.ensureReady();

    const prefixed = this._queryPrefix + text;
    const truncated = this.truncateText(prefixed);
    const output = await this.extractor!(truncated, {
      pooling: this._pooling,
      normalize: true,
    });

    const vector = new Float32Array(output.data);
    return {
      vector,
      model: this.modelName,
      dimensions: vector.length,
    };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    this.ensureReady();

    const results: EmbeddingResult[] = [];
    const truncatedTexts = texts.map((t) => this.truncateText(this._passagePrefix + t));

    // バッチサイズ制限でメモリ消費を制御
    for (let i = 0; i < truncatedTexts.length; i += BATCH_SIZE) {
      const batch = truncatedTexts.slice(i, i + BATCH_SIZE);

      try {
        const output = await this.extractor!(batch, {
          pooling: this._pooling,
          normalize: true,
        });

        const dimensions = this.getModelInfo().dimensions;
        for (let j = 0; j < batch.length; j++) {
          const vector = new Float32Array(
            output.data.slice(j * dimensions, (j + 1) * dimensions),
          );
          results.push({
            vector,
            model: this.modelName,
            dimensions,
          });
        }
      } catch (err) {
        // バッチ処理が失敗した場合は逐次処理にフォールバック
        for (const text of batch) {
          try {
            const result = await this.embed(text);
            results.push(result);
          } catch (innerErr) {
            throw new EmbeddingError(
              `Failed to embed text: ${String(innerErr)}`,
              innerErr instanceof Error ? innerErr : undefined,
            );
          }
        }
      }
    }

    return results;
  }

  getModelInfo(): EmbeddingModelInfo {
    return {
      name: this.modelName,
      dimensions: this._detectedDimensions ?? DEFAULT_DIMENSIONS,
      maxTokens: MAX_INPUT_TOKENS,
      languages: ['en', 'ja', 'zh', 'ko', 'de', 'fr', 'es'],
    };
  }

  async dispose(): Promise<void> {
    this.extractor = null;
    this._ready = false;
  }

  private ensureReady(): void {
    if (!this._ready || !this.extractor) {
      throw new EmbeddingError(
        'LocalEmbeddingProvider not initialized. Call initialize() first.',
      );
    }
  }

  /** 入力テキストの切り詰め */
  private truncateText(text: string): string {
    if (text.length > MAX_CHARS) {
      return text.slice(0, MAX_CHARS);
    }
    return text;
  }
}
