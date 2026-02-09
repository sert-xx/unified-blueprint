/**
 * Embedding プロバイダー抽象化インターフェース
 *
 * モデルの切り替えは、このインターフェースの新しい実装を追加するだけで完結する。
 * Core Layer のコードは一切変更不要。
 */

export interface EmbeddingResult {
  vector: Float32Array;
  model: string;
  dimensions: number;
}

export interface EmbeddingModelInfo {
  name: string;
  dimensions: number;
  maxTokens: number;
  languages: string[];
}

export interface EmbeddingProvider {
  /** プロバイダーの初期化（モデルのロード等） */
  initialize(): Promise<void>;

  /** 単一テキストの Embedding 生成（ドキュメント/パッセージ用） */
  embed(text: string): Promise<EmbeddingResult>;

  /** バッチ Embedding 生成（スループット最適化） */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** 検索クエリ用 Embedding 生成（instruction-tuned モデルで最適なプレフィックスを付与） */
  embedQuery?(text: string): Promise<EmbeddingResult>;

  /** ロード済みモデルの情報を返す */
  getModelInfo(): EmbeddingModelInfo;

  /** リソースの解放 */
  dispose(): Promise<void>;
}
