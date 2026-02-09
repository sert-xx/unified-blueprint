---
title: CLIコマンド設計
doc_type: guide
source_refs:
  - src/interface/cli/index.ts
  - src/interface/cli/commands/init.ts
  - src/interface/cli/commands/serve.ts
  - src/interface/cli/commands/search.ts
  - src/interface/cli/commands/status.ts
  - src/interface/cli/commands/reindex.ts
  - src/interface/cli/commands/stale.ts
  - src/interface/cli/commands/suggest-links.ts
---

# CLIコマンド設計

Unified Blueprintが提供するコマンドラインインターフェースの設計。Commander.jsを使用し、8つのコマンドを提供する。

## グローバルオプション

全コマンド共通のオプション:

| オプション | 短縮 | 説明 |
|---|---|---|
| `--cwd <path>` | - | プロジェクトルートの指定（デフォルト: カレントディレクトリ） |
| `--log-level <level>` | - | ログレベル: debug / info / warn / error |

## ubp init

プロジェクトの初期化を行う。ドキュメントディレクトリをスキャンし、全ファイルをパースしてインデックスを構築する。

### オプション

| オプション | 短縮 | デフォルト | 説明 |
|---|---|---|---|
| `--docs-dir <path>` | `-d` | `docs` | ドキュメントディレクトリ |
| `--include <patterns>` | `-i` | `**/*.md` | 対象ファイルパターン（カンマ区切り） |
| `--exclude <patterns>` | `-e` | `node_modules,dist,.git` | 除外パターン（カンマ区切り） |
| `--skip-embedding` | - | false | Embedding生成をスキップ |

### 処理フロー

1. `.ubp/`ディレクトリと`config.json`を作成
2. SQLiteデータベースを初期化（マイグレーション適用）
3. Embeddingモデルをダウンロード（初回のみ、`--skip-embedding`指定時はスキップ）
4. ドキュメントディレクトリをスキャンし、全`.md`ファイルを処理
5. パース → セクション分割 → リンク解決 → DB保存
6. Embedding生成をバックグラウンドキューで開始
7. 結果サマリーを表示

### オンボーディング

初回実行時にMCPサーバーの設定スニペットを表示し、Claude DesktopやCursorとの連携方法を案内する。

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["ubp", "serve"],
      "cwd": "/path/to/project"
    }
  }
}
```

## ubp serve

MCPサーバーをstdio経由で起動する。ファイル監視を同時に開始し、ドキュメント変更をリアルタイムでインデックスに反映する。

### オプション

| オプション | 短縮 | 説明 |
|---|---|---|
| `--skip-embedding` | - | Embedding生成をスキップ（FTS5フォールバックで動作） |

### 動作仕様

- stdioトランスポートでMCPプロトコルを提供
- プロセスロック（`.ubp/serve.lock`）で多重起動を防止
- 既存プロセスが検出された場合はPIDを表示してエラー終了
- SIGINT/SIGTERM受信時にグレースフルシャットダウン（ロック解放、DB切断）
- ファイル監視による変更の自動反映（デバウンス500ms）
- Embeddingプロバイダー初期化失敗時はFTS5フォールバックで動作継続

## ubp search

ドキュメントの検索を実行する。

### オプション

| オプション | 短縮 | デフォルト | 説明 |
|---|---|---|---|
| `--limit <n>` | `-l` | 10 | 返却件数上限 |
| `--fulltext` | `-f` | false | FTS5全文検索に切り替え |
| `--doc-type <type>` | `-t` | - | ドキュメント種別フィルタ |
| `--json` | - | false | JSON形式で出力 |

### 使用例

```bash
# ハイブリッド検索
ubp search "ドキュメント間の依存関係"

# FTS5全文検索
ubp search --fulltext "WikiLink"

# JSON出力
ubp search --json --limit 5 "検索アルゴリズム"
```

検索アルゴリズムの詳細は[[search-algorithm]]を参照。

## ubp status

プロジェクトの状態を表示する。

### オプション

| オプション | 説明 |
|---|---|
| `--json` | JSON形式で出力 |

### 出力内容

```typescript
{
  initialized: boolean,
  docs_dir: string,
  total_documents: number,
  total_sections: number,
  total_links: number,
  resolved_links: number,
  unresolved_links: number,
  embedding_progress: {
    completed: number,
    total: number,
    model: string
  },
  stale_documents: number,
  db_size_bytes: number
}
```

テーブル形式のデフォルト出力では、上記の情報を人間可読な形式で表示する。

## ubp reindex

インデックスの再構築を行う。

### オプション

| オプション | 短縮 | 説明 |
|---|---|---|
| `--force` | `-f` | 変更がなくても全ファイルを再処理 |
| `--file <path>` | - | 指定ファイルのみを再インデックス |
| `--skip-embedding` | - | Embedding再生成をスキップ |

### 差分更新

デフォルトでは`body_hash`と`content_hash`で変更を検出し、変更されたドキュメント・セクションのみを再処理する。Embeddingは`content_hash`が変更されたセクションのみ再生成される。

`--force`を指定すると全ファイルを強制的に再処理する。モデル変更後の全Embedding再生成に使用する。

ディスク上に存在しなくなったドキュメントはデータベースから自動削除される。

## ubp stale

陳腐化ドキュメントを一覧する。[[staleness-detection]]のsource_refsメカニズムに基づく。

### オプション

| オプション | 説明 |
|---|---|
| `--json` | JSON形式で出力 |
| `--exit-code` | 陳腐化ドキュメントが存在する場合exit code 1で終了 |

### 出力

各陳腐化ドキュメントについて、以下の情報を表示する:
- ファイルパス
- タイトル
- 陳腐化レベル（stale / untracked）
- 陳腐化の原因となったsource_ref一覧と理由（modified / deleted / not_found）

### CI利用例

```bash
# プルリクエストのチェックに組み込む
ubp stale --exit-code || echo "Stale documents found!"
```

## ubp suggest-links

ベクトル類似度に基づくドキュメント間のリンク提案を生成する。WikiLinkが未設定だが意味的に関連するドキュメントペアを検出する。

### オプション

| オプション | 短縮 | デフォルト | 説明 |
|---|---|---|---|
| `--threshold <n>` | `-t` | 0.5 | 類似度閾値（0.0〜1.0） |
| `--limit <n>` | `-l` | 20 | 提案数上限 |
| `--json` | - | false | JSON形式で出力 |

### 出力

```typescript
{
  suggestions: [{
    source_filepath: string,
    target_filepath: string,
    similarity: number,
    source_section: string,    // 関連セクションの見出し
    target_section: string
  }],
  total: number
}
```

## ubp version

UBPのバージョン情報を表示する。`package.json`のversionフィールドを参照する。

## CLI出力フォーマット

### テーブル出力

デフォルトのCLI出力はpicocolorsを使用した色付きテーブル形式。検索結果のスコア、陳腐化レベル等を視覚的に表示する。

### JSON出力

`--json`オプションを指定すると、全てのコマンドがJSON形式で出力する。パイプライン処理やスクリプトからの利用に対応する。

### プログレス表示

ファイル処理やEmbedding生成の進捗はスピナーとプログレスバーで表示する。

### エラー表示

エラーメッセージは赤色で表示し、可能な場合は解決方法のヒントを提示する。スタックトレースは`--log-level debug`指定時のみ表示する。
