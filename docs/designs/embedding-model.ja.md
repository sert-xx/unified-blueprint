---
title: Embeddingモデル設計
doc_type: spec
source_refs:
  - src/embedding/provider.ts
  - src/embedding/local-provider.ts
  - src/embedding/model-manager.ts
---

[English](./embedding-model.md)

# Embeddingモデル設計

ドキュメント検索に使用するEmbeddingモデルの選定理由、プロバイダー抽象化、instruction-tuned対応メカニズムを定義する。

## 選定結果

**デフォルトモデル: `Xenova/multilingual-e5-large`**

- 次元数: 1024
- モデルサイズ: 約560MB（ONNX量子化版）
- プーリング: mean pooling
- instruction-tuned: query/passageプレフィックス対応
- ランタイム: transformers.js（ONNX Runtime、ローカル実行）

## モデル選定ベンチマーク

13クエリ（キーワード・セマンティック・同義語/パラフレーズ・クロスリンガルの4カテゴリ）を使用した日本語検索品質ベンチマーク結果:

| モデル | サイズ | 次元 | Top1正解率 | Top3正解率 |
|---|---|---|---|---|
| all-MiniLM-L6-v2 | ~90MB | 384 | 15% | 69% |
| EmbeddingGemma-300M | ~200MB | 768 | 69% | 92% |
| paraphrase-multilingual-MiniLM-L12-v2 | ~480MB | 384 | 85% | 100% |
| multilingual-e5-small | ~130MB | 384 | 85% | 92% |
| **multilingual-e5-large** | **~560MB** | **1024** | **92%** | **100%** |
| BGE-M3 | ~600MB | 1024 | 85% | 100% |

multilingual-e5-largeが全カテゴリで最高の検索品質を示した。instruction prefix（query:/passage:）の効果により、セマンティック検索と同義語マッチングの精度が向上する。

### ベンチマークカテゴリ

- **キーワード（KW）**: 日本語キーワードによる直接的な検索（例: 「WikiLink」「陳腐化」）
- **セマンティック（SEM）**: 概念的な意味理解を要する検索（例: 「ドキュメント間の依存関係を管理する仕組み」）
- **同義語/パラフレーズ（SYN）**: 言い換えによる検索（例: 「文書の新鮮さ」→ 陳腐化検知設計）
- **クロスリンガル（EN）**: 英語クエリでの日本語ドキュメント検索（例: "hybrid search algorithm"）

## EmbeddingProviderインターフェース

モデル実装を抽象化し、モデル切り替えをインターフェース実装の追加だけで完結させる。

```typescript
interface EmbeddingProvider {
  /** プロバイダーの初期化（モデルのロード等） */
  initialize(): Promise<void>;

  /** ドキュメント/パッセージ用 Embedding 生成 */
  embed(text: string): Promise<EmbeddingResult>;

  /** バッチ Embedding 生成（スループット最適化） */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /** 検索クエリ用 Embedding 生成（instruction-tuned モデル用） */
  embedQuery?(text: string): Promise<EmbeddingResult>;

  /** ロード済みモデルの情報 */
  getModelInfo(): EmbeddingModelInfo;

  /** リソースの解放 */
  dispose(): Promise<void>;
}

interface EmbeddingResult {
  vector: Float32Array;   // 正規化済みベクトル
  model: string;          // モデル名
  dimensions: number;     // 次元数
}
```

### embed vs embedQuery

instruction-tunedモデル（e5ファミリー等）ではドキュメント格納時と検索時で異なるプレフィックスを使用する。

- `embed(text)`: ドキュメント格納用。passage prefix（`"passage: "`）を付与
- `embedQuery(text)`: 検索クエリ用。query prefix（`"query: "`）を付与

`embedQuery`はオプショナルメソッド。未定義の場合、`HybridSearch`は`embed()`にフォールバックする。

## LocalEmbeddingProvider

transformers.js（ONNX Runtime）によるローカルEmbedding生成の実装。

### デュアルパッケージサポート

`@huggingface/transformers`（v3）を優先し、`@xenova/transformers`（v2）にフォールバックする。いずれもoptionalDependencyとして定義。

```typescript
private async importTransformers(): Promise<any> {
  try {
    return await import('@huggingface/transformers');
  } catch {
    return await import('@xenova/transformers');
  }
}
```

### モデル自動検出

モデル名に基づいて以下を自動選択:

| モデルファミリー | プーリング | query prefix | passage prefix |
|---|---|---|---|
| e5系（`e5-`を含む） | mean | `"query: "` | `"passage: "` |
| BGE系（`bge`を含む） | cls | なし | なし |
| その他 | mean | なし | なし |

### 次元数自動検出

初期化時にプローブEmbedding（`"test"`）を生成し、出力ベクトルの長さから次元数を自動検出する。VectorIndexもデータの最初のロード/挿入時に次元数を自動判定する。

### テキスト切り詰め

入力テキストは最大2048文字で切り詰める。e5-largeの最大512トークンを十分に活用するための設定。

### バッチ処理

`embedBatch(texts)`はバッチサイズ32で分割処理する。バッチ全体が失敗した場合は個別の`embed()`呼び出しにフォールバックする。

## ModelManager

transformers.jsモデルのキャッシュ管理。

- キャッシュディレクトリ: `~/.cache/ubp/models/`（チルダ展開対応）
- `ensureCacheDir()`: キャッシュディレクトリの作成
- `isModelCached(modelName)`: モデルファイルの存在確認
- `getCacheDir()`: キャッシュパスの取得

モデルは初回の`initialize()`呼び出し時にHugging Face Hubから自動ダウンロードされ、以降はキャッシュから読み込まれる。

## モデル切り替え手順

1. `config.json`の`embedding.model`と`embedding.dimensions`を変更
2. `ubp reindex --force`を実行
3. 全セクションのEmbeddingが新モデルで再生成される

`SectionRepository.findByEmbeddingModelNot(model)`でモデルが異なるセクションを検出し、マイグレーション対象を特定できる。

## 設計上の制約

- ローカルファースト原則により、外部API（OpenAI等）のプロバイダーはMVP段階では提供しない
- モデルサイズは初回ダウンロード時にのみ影響し、以降はキャッシュから即座にロードされる
- クロスリンガル検索（英語クエリ→日本語ドキュメント）はベクトル検索のみが有効。FTS5キーワード検索は言語をまたげない
