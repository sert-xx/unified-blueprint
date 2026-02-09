# UBP - Unified Blueprint

Documentation-as-Code ミドルウェア。Markdown ドキュメントを Document Graph として構造化し、セマンティック検索・グラフ探索・全文検索を AI エージェントに提供する。

## 特徴

- **3-way ハイブリッド検索** — ベクトル検索 + グラフ探索 + FTS5 全文検索を統合スコアリング
- **Document Graph** — WikiLink (`[[target]]`) によるドキュメント間リンクをグラフ構造で管理
- **ローカル埋め込み** — Xenova/multilingual-e5-large による日英バイリンガル対応 (外部API不要)
- **MCP サーバー** — Claude Code / Claude Desktop / Cursor から直接利用可能
- **リアルタイム同期** — ファイル変更を監視し差分更新
- **鮮度検出** — `source_refs` によるドキュメントとソースコードの整合性チェック

## 必要環境

- Node.js >= 18.0.0

## インストール

```bash
npm install
npm run build
```

## クイックスタート

### 1. プロジェクト初期化

```bash
ubp init --docs-dir docs
```

`docs/` 配下の Markdown ファイルをパース、セクション分割、リンク解決、埋め込み生成を行い `.ubp/ubp.db` に格納する。

### 2. 検索

```bash
# セマンティック検索 (ハイブリッド)
ubp search "検索アルゴリズムの仕組み"

# 全文検索 (FTS5)
ubp search "trigram" --fulltext
```

### 3. MCP サーバー起動

```bash
ubp serve --no-lock
```

## MCP 連携設定

`ubp init` 実行時に設定スニペットが表示される。

**Claude Code:**

```bash
claude mcp add ubp -- node dist/main.js serve --no-lock
```

**Claude Desktop** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["-y", "ubp", "serve", "--no-lock"],
      "cwd": "/path/to/project"
    }
  }
}
```

## MCP ツール

| ツール | 説明 |
|---|---|
| `ubp_search` | セマンティック検索 (3-way ハイブリッド) |
| `ubp_get_page` | ドキュメント全文取得 |
| `ubp_get_context` | ドキュメント + 関連ドキュメント一括取得 |
| `ubp_fulltext_search` | キーワード全文検索 (FTS5) |
| `ubp_list_pages` | ドキュメント一覧 |
| `ubp_get_graph` | ドキュメント間リンクグラフ |

## CLI コマンド

| コマンド | 説明 |
|---|---|
| `ubp init` | プロジェクト初期化 (パース・埋め込み生成) |
| `ubp serve` | Watcher + MCP サーバーを起動 |
| `ubp search <query>` | ハイブリッド検索 / 全文検索 |
| `ubp status` | DB 統計情報の表示 |
| `ubp stale` | 鮮度の低いドキュメントを検出 |
| `ubp reindex` | 全ドキュメントを再インデックス |
| `ubp suggest-links` | リンク候補を提案 |
| `ubp version` | バージョン表示 |

グローバルオプション: `--cwd <path>`, `--json`, `--verbose`, `--quiet`

## Markdown 記法

### Frontmatter

```yaml
---
title: ドキュメントタイトル
tags: [設計, アーキテクチャ]
source_refs:
  - src/core/engine.ts
  - src/data/database-manager.ts
---
```

### WikiLink

```markdown
詳細は [[architecture]] を参照。
特定セクションへのリンク: [[database-schema#FTS5設定]]
エイリアス付き: [[search-algorithm|検索の仕組み]]
```

## 設定

`.ubp/config.json` で設定をカスタマイズできる。

```json
{
  "docs_dir": "docs",
  "source": {
    "include": ["**/*.md"],
    "exclude": []
  },
  "embedding": {
    "model": "Xenova/multilingual-e5-large",
    "dimensions": 1024,
    "batch_size": 32
  },
  "search": {
    "alpha": 0.7,
    "default_limit": 10,
    "max_depth": 2
  },
  "staleness": {
    "threshold_days": 7
  }
}
```

`search.alpha` は検索スコアの重み配分を制御する:

```
score = α × vector + β × graph + γ × fts5
β = (1 - α) × 0.67,  γ = (1 - α) × 0.33
```

## アーキテクチャ

```
Interface Layer     CLI (commander.js) / MCP Server (stdio)
        │
Core Layer          UbpEngine ← Parser, Search, Graph, Staleness, Watcher
        │
Data Layer          DatabaseManager, Repositories, VectorIndex, FTS5
        │
Embedding Layer     LocalEmbeddingProvider (ONNX Runtime)
```

## 開発

```bash
npm test              # テスト実行
npm run test:watch    # ウォッチモード
npm run typecheck     # 型チェック
npm run build         # ビルド
```

## ライセンス

MIT
