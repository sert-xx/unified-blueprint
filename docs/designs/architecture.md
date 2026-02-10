---
title: システムアーキテクチャ設計
doc_type: design
source_refs:
  - src/core/engine.ts
  - src/main.ts
---

# システムアーキテクチャ設計

Unified Blueprint（UBP）は、Git管理されたMarkdownドキュメント群をDocument Graphとして構造化し、AIエージェントからのセマンティック検索・グラフ探索を可能にするDocumentation-as-Codeミドルウェアである。

## 設計原則

- **ローカルファースト**: 外部APIへの依存なし。Embeddingモデルはローカル実行（transformers.js / ONNX Runtime）
- **ゼロコンフィグ起動**: `ubp init` 一発でセットアップ完了。デフォルト設定で実用的に動作する
- **Documentation-as-Code**: ドキュメントはGitで管理し、WikiLinkおよび通常Markdownリンクでドキュメント間の関係を明示する
- **MCP統合**: Model Context Protocol経由でClaude Desktop・Cursor等のAIエージェントと直接連携する

## レイヤー構造

システムは4つのレイヤーで構成される。各レイヤーは一方向の依存関係のみを持ち、上位レイヤーが下位レイヤーに依存する。

```
┌──────────────────────────────────────────────────┐
│  Interface Layer (CLI + MCP Server)              │
│    src/interface/cli/    src/interface/mcp/       │
├──────────────────────────────────────────────────┤
│  Core Layer (Engine Facade + Domain Logic)       │
│    src/core/engine.ts                            │
│    src/core/parser/   search/   graph/           │
│    src/core/watcher/  linker/   staleness/       │
│    src/core/embedding/  suggest/                 │
├──────────────────────────────────────────────────┤
│  Data Layer (SQLite + Vector Index)              │
│    src/data/database-manager.ts                  │
│    src/data/repositories/   services/            │
│    src/data/vector-index.ts                      │
├──────────────────────────────────────────────────┤
│  Embedding Layer (Provider Abstraction)          │
│    src/embedding/provider.ts                     │
│    src/embedding/local-provider.ts               │
│    src/embedding/model-manager.ts                │
└──────────────────────────────────────────────────┘
```

### Source Layer（入力）

Git管理されたMarkdownファイル群。フロントマターで`doc_type`・`source_refs`等のメタデータを、本文中のWikiLink（`[[target|link_type]]`）および通常Markdownリンク（`[text](./path.md)`）でドキュメント間の関係を記述する。

### Core Layer

ドメインロジックを担当するレイヤー。`UbpEngine`（`src/core/engine.ts`）がファサードとして全機能を統合する。Interface Layerは`UbpEngine`のみを通じてCore Layerにアクセスする。

| モジュール | ディレクトリ | 責務 |
|---|---|---|
| Parser | `src/core/parser/` | Markdownパース、フロントマター解析、セクション分割、WikiLink・Markdownリンク抽出 |
| Linker | `src/core/linker/` | WikiLink・Markdownリンクのファイルパス解決、ダングリングリンクの再解決 |
| Search | `src/core/search/` | ハイブリッド検索（ベクトル＋グラフ＋FTS5）、フォールバック |
| Graph | `src/core/graph/` | N-hopグラフ走査、近接度スコアリング |
| Watcher | `src/core/watcher/` | ファイル変更監視、デバウンス処理、変更パイプライン |
| Staleness | `src/core/staleness/` | source_refsハッシュ比較による陳腐化検知 |
| Embedding | `src/core/embedding/` | Embeddingジョブキュー、バッチ処理 |
| Suggest | `src/core/suggest/` | ベクトル類似度によるリンク提案 |

### Data Layer

SQLite（better-sqlite3）によるデータ永続化と、インメモリVectorIndexによるベクトル検索を提供する。`DatabaseManager`が全リポジトリとサービスを統合管理する。

詳細は[[database-schema|depends_on]]を参照。

### Embedding Layer

EmbeddingProviderインターフェースによりモデル実装を抽象化する。デフォルトの`LocalEmbeddingProvider`はtransformers.js（ONNX Runtime）でローカル実行する。

詳細は[[embedding-model|depends_on]]を参照。

### Interface Layer

#### CLI（Commander.js）

8つのコマンドを提供: init, serve, search, status, reindex, stale, suggest-links, version。詳細は[[cli-commands|depends_on]]を参照。

#### MCP Server

`@modelcontextprotocol/sdk`を使用し、stdio経由で6つのツールを公開する。詳細は[[mcp-tools|depends_on]]を参照。

## UbpEngine ファサード

`UbpEngine`はCore Layerの公開APIであり、Interface Layerとの唯一の接点となる。

### ライフサイクル

1. **initialize()**: 新規プロジェクトの初期化。設定保存→DB作成→Embeddingプロバイダー初期化→ファイルスキャン→パース→インデックス構築→Embeddingキュー起動
2. **loadExisting()**: 既存プロジェクトの読み込み。設定ロード→DB接続→Embeddingプロバイダー初期化→コアモジュール初期化
3. **close()**: リソース解放。ファイル監視停止→Embeddingキュー停止→プロバイダー解放→DB切断→ロガー終了

### 主要操作

| メソッド | 説明 |
|---|---|
| `search(SearchInput)` | ハイブリッドセマンティック検索 |
| `fulltextSearch(FulltextSearchInput)` | FTS5全文検索 |
| `getPage(GetPageInput)` | 単一ページ取得（リンク・陳腐化含む） |
| `getContext(GetContextInput)` | ページ＋グラフ近傍取得 |
| `listPages(ListPagesInput)` | 全ページ一覧 |
| `getGraph(GetGraphInput)` | グラフ構造取得 |
| `getStatus()` | プロジェクト統計 |
| `getStaleDocuments()` | 陳腐化ドキュメント一覧 |
| `suggestLinks()` | リンク提案生成 |
| `startWatching()` / `stopWatching()` | ファイル監視の制御 |
| `reindex(ReindexOptions)` | インデックス再構築 |

## エラーハンドリング

エラーは`UbpError`基底クラスから派生する階層化カスタムエラーで管理する。

```
UbpError (base)
├── ConfigError / ConfigNotFoundError
├── DatabaseError / MigrationError
├── ParseError
├── LinkResolutionError
├── EmbeddingError / EmbeddingModelNotAvailableError
├── DocumentNotFoundError
└── IndexNotReadyError
```

- ユーザー向けエラー（CLI出力・MCP応答）ではスタックトレースを含めない
- MCP経由のエラーはJSON-RPC形式でエラーコードとメッセージを返す
- Embeddingプロバイダー初期化失敗時はFTS5フォールバックで動作を継続する

## 設定管理

設定は`.ubp/config.json`に保存される。`UbpConfig`型で定義され、`DEFAULT_CONFIG`がデフォルト値を提供する。

```
.ubp/
├── config.json      # プロジェクト設定
├── knowledge.db     # SQLiteデータベース
├── knowledge.db-wal # WALファイル
└── serve.lock       # プロセスロック
```

設定の詳細は以下の通り:

| キー | デフォルト | 説明 |
|---|---|---|
| `docs_dir` | `"docs"` | ドキュメントディレクトリ |
| `source.include` | `["**/*.md"]` | 対象ファイルパターン |
| `source.exclude` | `["**/node_modules/**", ...]` | 除外パターン |
| `embedding.model` | `"Xenova/multilingual-e5-large"` | Embeddingモデル名 |
| `embedding.dimensions` | `1024` | ベクトル次元数 |
| `embedding.batch_size` | `32` | バッチサイズ |
| `search.alpha` | `0.7` | ベクトル重み（ハイブリッド検索） |
| `search.default_limit` | `10` | デフォルト検索件数 |
| `search.max_depth` | `2` | グラフ走査最大深度 |
| `staleness.threshold_days` | `7` | 陳腐化閾値日数 |
| `log.level` | `"info"` | ログレベル |

## デプロイメント

- ローカルプロセスとして動作し、外部サービスへの依存はない
- npmパッケージとして配布（`npx ubp init`で即座に利用開始）
- Node.js 18以上が必要
- Embeddingモデルは初回実行時に自動ダウンロードされ、`~/.cache/ubp/models/`にキャッシュされる
- プロセスロック（`serve.lock`）によりMCPサーバーの多重起動を防止する

## 非機能要件

- 検索レスポンス: 200ms以内（1000ドキュメント規模）
- 初期化: ファイル数に対して線形スケール
- メモリ: ベクトルインデックスはFloat32Arrayでインメモリ保持、SQLiteはmmap 256MBまで
- データベース: WALモード、synchronous=NORMAL、cache_size=64MB
