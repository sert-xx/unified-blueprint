[English](./README.md)

# 設計ドキュメント

UBP (Unified Blueprint) の技術設計ドキュメント。各ドキュメントは特定のサブシステムをカバーしています。

| ドキュメント | 説明 |
|-------------|------|
| [システムアーキテクチャ](./architecture.ja.md) | レイヤード構成 (Interface / Core / Data / Embedding) と各コンポーネントの責務 |
| [データベース設計](./database-schema.ja.md) | SQLite スキーマ設計 (documents, sections, links, source_refs, FTS5 仮想テーブル) |
| [検索アルゴリズム](./search-algorithm.ja.md) | ベクトル類似度 + グラフ近接度 + FTS5 全文検索の 3-way ハイブリッド検索 |
| [Embedding モデル](./embedding-model.ja.md) | Xenova/multilingual-e5-large によるローカル埋め込み、トークン推定、バッチ処理 |
| [MCP ツール仕様](./mcp-tools.ja.md) | MCP サーバーツール仕様 (ubp_search, ubp_get_page, ubp_get_context 等) |
| [CLI コマンド](./cli-commands.ja.md) | CLI コマンド設計 (init, serve, search, status, stale, reindex, suggest-links, version) |
| [非同期パイプライン](./async-pipeline.ja.md) | キューベースの非同期埋め込みパイプラインとバッチ最適化 |
| [陳腐化検知](./staleness-detection.ja.md) | source_refs ハッシュ比較によるドキュメント鮮度追跡 |

## アーキテクチャ概要

```
Interface Layer     CLI (commander.js) / MCP Server (stdio)
        │
Core Layer          UbpEngine ← Parser, Search, Graph, Staleness, Watcher
        │
Data Layer          DatabaseManager, Repositories, VectorIndex, FTS5
        │
Embedding Layer     LocalEmbeddingProvider (ONNX Runtime)
```

詳細は[システムアーキテクチャ](./architecture.ja.md)を参照。
