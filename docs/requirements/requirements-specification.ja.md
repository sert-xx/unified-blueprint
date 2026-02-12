[English](./requirements-specification.md)

# Unified Blueprint (UBP) 要件定義書

**Version:** 1.0.0
**Status:** Approved
**作成日:** 2026-02-07
**ベースドキュメント:** PRD v1.0.0（要求定義.md）
**統合レビュー:** アーキテクト / バックエンドエンジニア / フロントエンドエンジニア / UI/UXデザイナー / デビルズ・アドボケート

---

## 1. プロダクト概要・ビジョン

### 1.1 プロダクト名

**Unified Blueprint (UBP)**

### 1.2 コンセプト

**「人間には『使い慣れたノート』を。AIには『完璧な設計図』を。」**

人間はMarkdownで自然言語のドキュメントを書くだけでよい。システムがそれを裏側で解析し「構造化データ（グラフ）」と「意味空間（ベクトル）」に自動変換し、人間とAIエージェントが高度なコンテキストを共有できる基盤を提供する。

### 1.3 解決する課題

| # | 課題 | 詳細 | UBPの解決アプローチ |
|---|------|------|---------------------|
| 1 | インターフェースの不一致 | 人間は自然言語を好み、AIは構造化データを好む。Notionは曖昧すぎてハルシネーションの原因、JSON/YAMLは人間に苦痛 | 人間にはMarkdownエディタを、AIにはグラフ+ベクトルで構造化されたコンテキストをMCP Server経由で提供する |
| 2 | コンテキストの「量」と「質」のジレンマ | AIのコンテキストウィンドウは有限。全文検索RAGではキーワードは合うが文脈が異なる無関係情報をノイズとして拾う | グラフ対応検索（Graph-Aware Retrieval）により、ベクトル類似度とグラフ近接度を組み合わせたハイブリッドランキングで関連性の高い情報のみを提供する |
| 3 | 「暗黙知」の消失 | 熟練開発者の脳内メンタルマップ（機能とテーブルの関連等）がフラットなMarkdownでは明示されない。AIが影響範囲を予測できずバグを埋め込む | `[[Link]]` によるグラフ構造で暗黙的な依存関係を明示化する。リンクラベル（`[[ページ|depends_on]]`）で関係の種類も表現可能にする |
| 4 | ドキュメントの形骸化 | コード変更してもドキュメントは自動更新されない。古いドキュメントからAIが動かないコードを生成する悪循環 | Frontmatterの `source_refs` でコードファイルとの紐付けを管理し、鮮度検出（Staleness Detection）でドキュメントの陳腐化を自動検知・警告する |

### 1.4 コアバリュー

1. **Frictionless Writing（摩擦のない執筆）:** ユーザーは「ノード」や「エッジ」を意識せず、Wikiのように文章を書くことに集中できる
2. **Implicit Structuring（暗黙的な構造化）:** `[[Link]]` 記法や文書構造から、システムが自動的に依存関係グラフを構築する
3. **Semantic Portability（可搬性）:** 全てのドキュメントがプレーンMarkdownファイルとして保持され、Gitで管理・共有できる

### 1.5 既存ツールとの差別化

Obsidian + プラグイン構成との差別化ポイント:

- **MCP Server のファーストクラスサポート:** AIエージェントへの構造化コンテキスト提供が設計の根幹にある。セマンティック検索 + グラフ探索の複合的なコンテキスト取得をワンツール呼び出しで実現する
- **ゼロコンフィグの構造化:** インストール後、`ubp init` からドキュメント作成、AI連携まで追加プラグインの設定なしに動作する
- **CLI-first 設計:** Phase 0 でCLIツールとしてのコアバリューを検証し、エディタUIは段階的に提供する。既存エディタ（VS Code、Obsidian等）との併用を前提とする

---

## 2. ユーザーペルソナ

### 2.1 Primary: テックリード / アーキテクト

- **プロフィール:** スタートアップのテックリード、チームを率いる立場
- **課題:** 頭の中の設計をドキュメント化する時間がない。書いてもAIに正確に伝わらない
- **ゴール:** 自然言語で考えを書きながら、AIが理解できる構造化された設計書を自動生成したい
- **技術力:** 高い。CLI操作に慣れている。VS Code / Obsidianユーザー
- **UX期待:** キーボード中心の操作。素早いページ切り替え。余計なUIは不要

### 2.2 Secondary: バックエンドエンジニア

- **プロフィール:** Webアプリケーションエンジニア
- **課題:** 既存の設計書から自分の担当範囲に関連する情報だけを素早く見つけたい
- **ゴール:** AI（Claude Code等）に正確なコンテキストを渡して、実装の精度を上げたい
- **技術力:** 中から高。Notionでの文書作成に慣れている
- **UX期待:** 検索が速いこと。リンクの依存関係が視覚的にわかること

### 2.3 Tertiary（将来対応）: プロダクトマネージャー

- **課題:** 要件定義書を書いても、エンジニアとの認識齟齬が生じる
- **ゴール:** 要件を書くだけで、エンジニアもAIも同じコンテキストを共有できる状態にしたい
- **UX期待:** GUIベースの操作。ツールバーやボタンが充実していること
- **対応時期:** Phase 2 以降。ただし、後からGUI要素を追加しやすいアーキテクチャにしておく

---

## 3. ファイルフォーマット仕様

### 3.1 基本方針

**Markdownファイル群 + SQLiteメタデータ**の折衷構成を採用する。

- ドキュメント本体はプレーンMarkdownファイルとして保持（Git diff 可能、ロックインリスクなし）
- グラフ構造・ベクトルデータ・メタデータはSQLiteデータベースで管理（高速クエリ、ACID準拠）
- UBPを使わなくてもドキュメント自体はそのまま読める

### 3.2 ディレクトリ構造

```
project-root/
├── pages/                          # Markdownファイル群（人間が直接編集可能）
│   ├── ログイン機能.md
│   ├── ユーザーDB.md
│   └── ...
├── .ubp/                           # UBPメタデータディレクトリ
│   ├── manifest.json               # プロジェクト設定・スキーマバージョン
│   └── metadata.db                 # SQLiteデータベース（グラフ + ベクトル + FTS）
└── .gitignore                      # .ubp/metadata.db を除外
```

### 3.3 Git管理方針

| 対象 | Git管理 | 理由 |
|------|---------|------|
| `pages/*.md` | 対象 | テキストファイル。diff・マージが可能 |
| `.ubp/manifest.json` | 対象 | プロジェクト設定。テキストベースで差分管理可能 |
| `.ubp/metadata.db` | 除外 | バイナリファイル。`ubp rebuild` コマンドで再生成可能 |

### 3.4 manifest.json 仕様

```json
{
  "version": "1.0.0",
  "schema_version": 1,
  "embedding_model": {
    "name": "all-MiniLM-L6-v2",
    "version": "1.0",
    "dimensions": 384
  },
  "pages_dir": "pages",
  "created_at": "2026-02-07T00:00:00Z"
}
```

### 3.5 ページファイル仕様

各ページは `pages/` ディレクトリ内のMarkdownファイルとして保存する。

```markdown
---
id: 01234567-89ab-cdef-0123-456789abcdef
title: ログイン機能
type: spec
source_refs:
  - src/auth/login.ts
  - src/auth/middleware.ts
created_at: 2026-02-07T00:00:00Z
updated_at: 2026-02-07T12:00:00Z
---

# ログイン機能

ユーザー情報は [[ユーザーDB]] テーブルを参照する。
認証フローは [[OAuth2.0仕様|depends_on]] に準拠する。
```

- Frontmatter（YAML）でメタデータを管理
- ファイル名はページタイトルをそのまま使用（日本語可）
- ID は UUID v7 を使用（タイムスタンプ付き、ソート可能）

#### Frontmatter フィールド定義

| フィールド | 必須 | 型 | 説明 |
|-----------|------|-----|------|
| `id` | 必須 | string | UUID v7。システムが自動生成 |
| `title` | 必須 | string | ページタイトル |
| `type` | 任意 | string | ページの種類。`spec` / `design` / `db-schema` / `api` / `config` / `guide` のいずれか。未指定時は `spec` |
| `source_refs` | 任意 | string[] | 関連するソースコードファイルのパス（プロジェクトルートからの相対パス）。鮮度検出に使用 |
| `created_at` | 必須 | string | ISO 8601。システムが自動生成 |
| `updated_at` | 必須 | string | ISO 8601。保存時にシステムが自動更新 |

---

## 4. 機能要件

### 4.1 Phase 0: CLI基盤

Phase 0はコアバリュー検証のためのCLIツールを提供する。エディタUIは含まず、ユーザーは任意のテキストエディタ（VS Code、Obsidian等）でMarkdownを編集する。

#### 4.1.1 `ubp init`

- カレントディレクトリにUBPプロジェクトを初期化する
- `pages/` ディレクトリ、`.ubp/manifest.json`、`.ubp/metadata.db` を生成
- `.gitignore` に `.ubp/metadata.db` を追加

#### 4.1.2 `ubp add <file>`

- 指定されたMarkdownファイル（または `pages/` 配下の全ファイル）をインデックスに追加する
- Markdownを解析し、`[[Link]]` を抽出してグラフを構築する
- Embeddingを生成してベクトルインデックスに追加する

#### 4.1.3 `ubp search <query>`

- **Graph-Aware Retrieval** によるハイブリッド検索を実行する
  - ベクトル類似度とグラフ近接度を組み合わせたスコアリング: `final_score = α * vector_similarity + (1-α) * graph_proximity`（α のデフォルト: 0.7）
  - グラフ近接度: クエリに最も関連するページからのホップ距離の逆数
- 検索結果にはスコアの内訳（ベクトル類似度、グラフ距離）を表示する
- オプション: `--fulltext` で全文検索（FTS5）モードに切り替え
- オプション: `--limit N` で結果件数を制限（デフォルト: 5）
- オプション: `--alpha N` でベクトル類似度の重みを調整（0.0-1.0、デフォルト: 0.7）

#### 4.1.4 `ubp graph [page]`

- ページ間のリンク関係をテキストまたはJSON形式で出力する
- `page` を指定した場合、そのページを中心としたN-hop探索結果を出力
- オプション: `--depth N` で探索深さを指定（デフォルト: 2）
- オプション: `--format json|text` で出力形式を指定

#### 4.1.5 `ubp rebuild`

- `pages/` 配下の全Markdownファイルをリパースし、グラフとベクトルインデックスを再構築する
- Embeddingモデル変更時や、Gitマージ後のメタデータ再生成に使用

#### 4.1.6 `ubp mcp-server`

- MCP Server をstdioトランスポートで起動する
- Claude Code / Claude Desktop 等のAIツールから接続して利用する
- 詳細はセクション8「MCP Server インターフェース定義」を参照

#### 4.1.7 `ubp status`

- 現在のプロジェクト状態を表示する（ページ数、リンク数、ベクトル化済みページ数、未インデックスページ数）
- **鮮度検出（Staleness Detection）:** `source_refs` が設定されているページについて、参照先コードファイルの最終更新日とページの最終更新日を比較し、陳腐化の可能性があるページを警告表示する
  - 鮮度ステータス: `fresh`（ドキュメントがコードより新しい）/ `possibly_stale`（コードが更新されたがドキュメント未更新、7日以内）/ `stale`（コードが更新されたがドキュメント未更新、7日超過）
  - 例: `[STALE] ログイン機能.md — src/auth/login.ts が 2026-02-05 に更新されています`

#### 4.1.8 `ubp stale`

- 鮮度が `possibly_stale` または `stale` のページ一覧を表示する専用コマンド
- オプション: `--json` でJSON形式出力（CI/CD連携用）
- Git pre-commit フックとして使用可能: `ubp stale --exit-code` で stale なページがある場合に非ゼロ終了コードを返す

#### 4.1.9 `ubp suggest-links`

- 暗黙リンクの自動提案: ベクトル類似度が高い（閾値以上）がリンクで繋がっていないページペアを検出し、リンク候補として提案する
- オプション: `--threshold N` で類似度の閾値を調整（0.0-1.0、デフォルト: 0.8）
- オプション: `--limit N` で提案数を制限（デフォルト: 10）
- 出力例: `[0.92] ログイン機能.md <-> セッション管理.md — リンクが存在しませんが、内容が類似しています`

### 4.2 Phase 1: Architect Viewer（Webエディタ）

Phase 0の検証結果を踏まえ、Webベースの専用エディタを提供する。

#### 4.2.1 起動方法

```bash
npx ubp viewer
```

ローカルサーバーを起動し、ブラウザで開く方式。

#### 4.2.2 Markdownエディタ

- CodeMirror 6 ベースのMarkdownエディタを提供する
- ソースモード（Markdown原文編集）をデフォルトとする
- テキスト選択時のフローティングツールバー（太字、イタリック、リンク等）
- フォーカスモード（サイドパネルを閉じてエディタのみ表示）

#### 4.2.3 Smart Linking

- `[[` 入力時にオートコンプリートパネルを表示する
  - 既存ページ名のファジーマッチ検索（日本語IME対応）
  - 候補表示: 最大8件、上下キーで選択、Enter/Tabで確定、Escでキャンセル
  - 該当ページが存在しない場合、「新規作成: {ページ名}」オプションを表示
- リンク先ページが存在しない場合、空ページを自動生成する
- リンクのホバープレビュー: リンク先ページの冒頭200文字をツールチップ表示（300ms遅延）
- Ctrl+クリック（Cmd+クリック）でリンク先ページへジャンプ
- 存在しないページへのリンクは赤い波線下線で表示

#### 4.2.4 バックリンクパネル

- ページ下部に「このページを参照しているページ」の一覧を表示する
- 各バックリンクにはリンク元の文脈（前後のテキスト）を表示
- バックリンクのクリックでリンク元ページへ遷移

#### 4.2.5 サイドバーナビゲーション

- ページ一覧（フラットリスト、更新日・タイトル順のソート対応）
- お気に入り / ピン留め
- 最近開いたページ

#### 4.2.6 グローバル検索（Cmd+K / Ctrl+K）

- コマンドパレット型の統合検索UI
- ページタイトルのファジーマッチ検索
- 全文検索（FTS5）
- 検索結果にはページタイトル + マッチした文脈スニペットを表示

#### 4.2.7 Real-time Sync

- エディタの入力内容は自動的にローカルファイルに保存される
- デバウンス戦略:
  - キー入力: 300ms
  - ペースト / ページ遷移 / フォーカスロスト: 即時
  - アイドル検出: 2000ms
- 保存状態インジケータ:「保存済み」「保存中...」「未保存の変更あり」

#### 4.2.8 リンクラベル（タイプ付きリンク）

- `[[ページ名|ラベル]]` のパイプ区切り記法でリンクにラベル（型）を付与できる
  - 例: `[[ユーザーDB|depends_on]]`、`[[OAuth2.0仕様|implements]]`
- 定義済みラベル: `depends_on` / `implements` / `extends` / `references`（デフォルト）/ `conflicts_with`
- ラベルなし（`[[ページ名]]`）の場合は `references` として扱う
- `[[` 入力後のオートコンプリートで、ページ名確定後に `|` を入力するとラベル候補を表示する
- エディタ上ではラベルに応じた色分け表示を行う（例: `depends_on` は青、`conflicts_with` は赤）

#### 4.2.9 暗黙リンクの自動提案

- ベクトル類似度が高い（閾値: 0.8以上）がリンクされていないページペアを自動検出する
- サイドバーまたはページ下部に「リンク候補」として提案表示する
- ワンクリックで承認（リンク挿入）/ 却下（非表示化）が可能
- 提案はバックグラウンドで計算し、エディタの応答性に影響しない

#### 4.2.10 鮮度インジケータ

- ページ一覧およびエディタ上部に鮮度ステータスを視覚的に表示する
  - 緑（Fresh）: ドキュメントが最新
  - 黄（Possibly Stale）: 関連コードが更新されたがドキュメント未更新（7日以内）
  - 赤（Stale）: 関連コードが更新されたがドキュメント未更新（7日超過）
  - 灰色: `source_refs` 未設定（鮮度追跡対象外）
- Stale なページを開いた際、エディタ上部にバナーで警告を表示:「関連コード（src/auth/login.ts）が更新されています。ドキュメントの確認をお勧めします」
- サイドバーのページ一覧でもアイコンで鮮度ステータスを表示

#### 4.2.11 ダークモード

- ライト / ダークの2テーマを提供
- CSS Custom Properties ベースのテーマシステム
- OSの設定（`prefers-color-scheme`）を初期値として使用

### 4.3 Phase 2: 拡張機能

以下の機能は Phase 2 以降で検討する。

| 機能 | 概要 | 前提条件 | 対応課題 |
|------|------|----------|----------|
| Graph View | Cytoscape.js によるグラフ可視化（ローカルグラフ + グローバルグラフ）。ホップ距離の可視化を含む | Phase 1 の安定稼働 | 課題3 |
| AI自動ページ作成 | MCP Server 経由でAIがページを作成・更新する機能 | MCP読み取り系の安定稼働 | 課題4 |
| AI変更レビューUI | Git PRライクなdiff表示、承認/修正/却下のアクション。AIによる変更履歴の監査ログ | AI自動ページ作成の実装 | 課題4 |
| AIコンテキスト可視化 | 「AIにはこう見えている」プレビューパネル。グラフ上でAI参照範囲をハイライト表示 | MCP Server + Graph Viewの安定稼働 | 課題1 |
| Staleness Dashboard | プロジェクト全体の鮮度状況を一覧表示するダッシュボード画面。Staleページの一括管理 | 鮮度検出の安定稼働 | 課題4 |
| 構造化確信度スコア | 自動構造化の確信度表示。低確信度の構造をユーザーにレビュー依頼 | リンクラベル機能の安定稼働 | 課題3 |
| Impact Analysis | `ubp_get_impact`: ページ型（spec/db-schema/api等）の組み合わせから影響チェーンを推定 | リンクラベル + ページ型の安定稼働 | 課題3 |
| コード-ドキュメント双方向リンク | `[[src/auth/login.ts]]` でコードファイルを直接参照。コード側からの逆引きも可能 | Staleness Detection の安定稼働 | 課題4 |
| Context Window Budget | MCP Serverが返すトークン数の予算管理。上限設定と優先順位付けによるコンテキスト最適化 | MCP Server の安定稼働 | 課題2 |
| デスクトップアプリ化 | Tauri による軽量デスクトップアプリ | Phase 1 のWeb版で検証完了 | - |
| VSCode拡張 | VS Code 内でUBPの機能を利用 | UBP Core のライブラリ化 | - |
| タグシステム | `#tag` 形式のタグによるページ分類 | ページ管理の安定稼働 | - |
| テンプレート機能 | 頻出するページ構造のテンプレート | エディタの安定稼働 | - |
| インポート機能 | Obsidian vault / Notion エクスポートからの一括インポート | ファイル構造の安定 | - |
| マルチユーザー同時編集 | CRDT（Yjs等）による同時編集 | 将来検討 | - |

---

## 5. 非機能要件

### 5.1 Local First

- 外部SaaSに依存せず、ローカル環境（オフライン）でコア機能（編集・リンク解析・グラフ構築・検索・MCP Server）が全て動作すること
- Embedding生成はローカルのONNX Runtimeで実行する
- 初回セットアップ時のみEmbeddingモデルのダウンロードにネットワーク接続が必要（約80MB）
- ダウンロード済みモデルはローカルにキャッシュし、以降はオフラインで動作する

### 5.2 Git Friendly

- ドキュメント本体（`pages/*.md`）はプレーンMarkdownとしてGit管理可能であること
- `git diff` でドキュメントの変更差分が確認できること
- メタデータDB（`.ubp/metadata.db`）は `.gitignore` で除外し、`ubp rebuild` で再生成可能であること
- GitHubのWeb UIでドキュメントがプレビュー表示されること

### 5.3 パフォーマンス

1000ページ規模のドキュメントにおける性能目標:

| 操作 | 目標レスポンスタイム |
|------|---------------------|
| エディタのキー入力から描画 | < 16ms（60fps） |
| ページ保存（同期部分） | < 50ms |
| ページ切り替え | < 100ms |
| `[[Link]]` 補完候補表示 | < 50ms |
| 全文検索（FTS5） | < 100ms |
| セマンティック検索（Top-5） | < 200ms |
| リンクグラフ取得（depth=2） | < 100ms |
| ページ一覧取得 | < 50ms |
| Embedding生成（1ページ） | < 50ms |
| 全ページの初期Embedding（1000ページ） | < 60秒（バックグラウンド） |

### 5.4 データ整合性

- ページ保存は即座にファイルシステムにコミットされること
- Embedding生成はバックグラウンドで非同期に実行し、エディタの応答性を阻害しないこと
- アプリケーションクラッシュ時にデータが失われないこと（SQLiteのWALモードによるACID保証）

### 5.5 ポータビリティ

- macOS、Linux、Windows の主要プラットフォームで動作すること
- Node.js v20 以上で動作すること
- `npx` による即時実行が可能であること

---

## 6. 技術スタック（推奨）

### 6.1 Phase 0: CLI

| レイヤー | 技術 | 選定理由 |
|----------|------|----------|
| 言語 | TypeScript (Node.js) | エコシステムの成熟度、型安全性 |
| CLI フレームワーク | commander / citty | 軽量で十分な機能 |
| Markdownパーサー | remark / unified | プラグインエコシステムが豊富。`[[Link]]` のカスタムパーサーを実装可能 |
| データベース | better-sqlite3 | 同期API、高速、Node.jsとの統合が良い |
| 全文検索 | SQLite FTS5 | better-sqlite3に内蔵。追加依存なし |
| ベクトル検索 | インメモリ（コサイン類似度） | 1000ページ規模ではブルートフォースで十分高速。将来的に sqlite-vec へ移行可 |
| Embedding | ONNX Runtime (onnxruntime-node) + all-MiniLM-L6-v2 | ローカル実行、高速、Node.jsバインディング |
| MCP Server | @modelcontextprotocol/sdk | 公式SDK。stdioトランスポート |
| ファイル監視 | chokidar | クロスプラットフォーム対応のファイルウォッチャー |
| モノレポ | pnpm workspaces | パッケージ管理の効率化 |

### 6.2 Phase 1: Architect Viewer

| レイヤー | 技術 | 選定理由 |
|----------|------|----------|
| エディタ | CodeMirror 6 | モジュラー設計、仮想化レンダリング、カスタム構文拡張、IME対応 |
| HTTPサーバー | Hono | 軽量、高速、TypeScript-first |
| Webフレームワーク | 設計フェーズで決定 | Phase 0の検証結果とチームの技術スタックを考慮して選定 |
| グラフ可視化（Phase 2） | Cytoscape.js | フレームワーク非依存、グラフ特化、豊富なレイアウトアルゴリズム |

### 6.3 日本語対応

- Embeddingモデルは `all-MiniLM-L6-v2`（384次元、約80MB）でMVPを開始する
- 日本語検索精度に課題が出た場合、`paraphrase-multilingual-MiniLM-L12-v2`（50言語対応、約470MB）へ移行する
- 全文検索はSQLite FTS5 + unicode61 トークナイザーで日本語対応する

---

## 7. データモデル（スキーマ定義）

### 7.1 SQLiteスキーマ

```sql
-- Pragma settings
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;         -- 64MB cache
PRAGMA mmap_size = 268435456;       -- 256MB memory map
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = ON;

-- Pages (node) table
CREATE TABLE pages (
    id TEXT PRIMARY KEY,              -- UUID v7
    title TEXT NOT NULL UNIQUE,       -- Page title
    file_path TEXT NOT NULL UNIQUE,   -- Relative path from pages/
    body_hash TEXT,                   -- SHA-256 hash of content (for diff detection)
    created_at TEXT NOT NULL,         -- ISO 8601
    updated_at TEXT NOT NULL          -- ISO 8601
);

-- Links (edge) table
CREATE TABLE links (
    source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'reference',  -- Edge type (MVP: reference only)
    context TEXT,                     -- Context where link appears (50 chars before/after)
    created_at TEXT NOT NULL,
    PRIMARY KEY (source_page_id, target_page_id)
);

-- Vectors table
CREATE TABLE page_vectors (
    page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,          -- Float32Array binary (384 dimensions x 4 bytes = 1536 bytes)
    model_version TEXT NOT NULL,      -- Embedding model version
    source_hash TEXT NOT NULL,        -- body_hash at vectorization time (for incremental updates)
    updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_pages_title ON pages(title);
CREATE INDEX idx_pages_updated_at ON pages(updated_at);
CREATE INDEX idx_links_target ON links(target_page_id);
CREATE INDEX idx_links_type ON links(type);
CREATE INDEX idx_vectors_model ON page_vectors(model_version);

-- Source code reference freshness tracking table (for Staleness Detection)
CREATE TABLE source_refs_state (
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,               -- Source code file path
    last_synced_hash TEXT,                 -- SHA-256 hash at last sync check
    last_synced_at TEXT,                   -- Last sync check time (ISO 8601)
    is_stale BOOLEAN NOT NULL DEFAULT 0,   -- Freshness flag
    PRIMARY KEY (page_id, file_path)
);

-- Implicit link suggestion table
CREATE TABLE suggested_links (
    source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,        -- Vector similarity score
    status TEXT NOT NULL DEFAULT 'pending', -- pending / accepted / dismissed
    suggested_at TEXT NOT NULL,             -- ISO 8601
    resolved_at TEXT,                       -- Accepted/dismissed time
    PRIMARY KEY (source_page_id, target_page_id)
);

-- Additional indexes
CREATE INDEX idx_source_refs_stale ON source_refs_state(is_stale) WHERE is_stale = 1;
CREATE INDEX idx_suggested_links_status ON suggested_links(status);

-- FTS5 full-text search
CREATE VIRTUAL TABLE pages_fts USING fts5(
    title,
    body,
    content='pages',
    content_rowid='rowid',
    tokenize='unicode61'
);
```

### 7.2 ノードモデル

```typescript
interface Page {
    id: string;           // UUID v7
    title: string;        // ページタイトル
    filePath: string;     // pages/ からの相対パス
    body: string;         // Markdownコンテンツ（DBには格納せず、ファイルから読み込み）
    bodyHash: string;     // SHA-256ハッシュ
    createdAt: string;    // ISO 8601
    updatedAt: string;    // ISO 8601
}

interface PageSummary {
    id: string;
    title: string;
    updatedAt: string;
    linkCount: number;    // 発信リンク数
    backlinkCount: number; // 被リンク数
}
```

### 7.3 エッジモデル

```typescript
// リンクタイプの定義
type LinkType = 'references' | 'depends_on' | 'implements' | 'extends' | 'conflicts_with';

interface Link {
    sourcePageId: string;
    targetPageId: string;
    type: LinkType;       // Phase 0: references のみ。Phase 1 でラベル付きリンク対応
    context: string;      // リンクが出現した文脈
    createdAt: string;
}

interface LinkInfo {
    page: PageSummary;    // リンク先/元ページの概要
    context: string;      // リンクの文脈
    type: LinkType;
}
```

### 7.4 鮮度追跡モデル

```typescript
type StalenessStatus = 'fresh' | 'possibly_stale' | 'stale' | 'untracked';

interface SourceRefState {
    pageId: string;
    filePath: string;         // ソースコードファイルのパス
    lastSyncedHash: string;   // 最後に同期確認したファイルハッシュ
    lastSyncedAt: string;     // ISO 8601
    isStale: boolean;
}

interface PageStaleness {
    pageId: string;
    pageTitle: string;
    status: StalenessStatus;
    staleRefs: Array<{
        filePath: string;
        lastModified: string;  // コードファイルの最終更新日時
        pageSyncedAt: string;  // ドキュメントの最終同期日時
    }>;
}
```

鮮度判定ロジック:
1. `source_refs` が未設定のページは `untracked`
2. 全ての参照先ファイルのハッシュが一致している場合は `fresh`
3. ハッシュが不一致で、コードファイルの更新が7日以内の場合は `possibly_stale`
4. ハッシュが不一致で、コードファイルの更新が7日超過の場合は `stale`

### 7.5 暗黙リンク提案モデル

```typescript
interface SuggestedLink {
    sourcePageId: string;
    targetPageId: string;
    similarityScore: number;   // 0.0 - 1.0
    status: 'pending' | 'accepted' | 'dismissed';
    suggestedAt: string;
    resolvedAt?: string;
}
```

### 7.4 グラフ探索（再帰CTE）

```sql
-- center_page_id から depth ホップまで探索
WITH RECURSIVE graph AS (
    SELECT source_page_id, target_page_id, 1 AS depth
    FROM links
    WHERE source_page_id = :center_page_id

    UNION ALL

    SELECT l.source_page_id, l.target_page_id, g.depth + 1
    FROM links l
    JOIN graph g ON l.source_page_id = g.target_page_id
    WHERE g.depth < :max_depth
)
SELECT DISTINCT source_page_id, target_page_id, depth FROM graph;
```

- 循環参照は許容する（有向グラフ）。深さ制限で無限ループを防止
- バックリンクの取得には `idx_links_target` インデックスによる逆引きを使用

### 7.5 Auto-Vectorization パイプライン

```
ページ保存
    |
    v
body_hash 計算（SHA-256）
    |
    v
page_vectors.source_hash と比較
    |  (不一致 or 未存在)
    v
Embedding 生成（非同期・バックグラウンド）
    |
    v
page_vectors テーブルに UPSERT
```

- 保存は同期的に即座に完了させる（< 50ms）
- ベクトル化は保存後に非同期で実行し、エディタの応答性をブロックしない
- debounce（500ms）で高速な連続入力中の無駄な処理を抑制
- ベクトル化完了前は、前バージョンのベクトルでセマンティック検索を実行する

### 7.8 Smart Linking パーサー

```typescript
// ラベル付きリンクに対応: [[ページ名]] または [[ページ名|ラベル]]
const LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface ParsedLink {
    targetTitle: string;    // リンク先ページタイトル
    linkType: LinkType;     // ラベル（未指定時は 'references'）
    position: {
        start: number;
        end: number;
    };
    context: string;        // 前後50文字程度の文脈
}
```

リンク更新フロー:
1. ページ保存時にMarkdown本文を解析し、`[[...]]` パターンを全て抽出する
2. `[[ページ名|ラベル]]` 形式の場合、パイプ以降をリンクタイプとして解析する。無効なラベルの場合は `references` にフォールバック
3. 抽出したリンク先タイトルのリストと、既存の `links` テーブルのレコードを比較する
4. 差分更新を行う:
   - 新規リンク: INSERT + リンク先ページが未存在なら空ページを自動生成
   - 削除されたリンク: DELETE
   - ラベル変更: UPDATE（typeカラムを更新）
   - 変更なし: 何もしない

---

## 8. MCP Server インターフェース定義

### 8.1 トランスポート

- **プロトコル:** MCP (Model Context Protocol)、JSON-RPC ベース
- **トランスポート:** stdio（Claude Code / Claude Desktop 連携用）
- **実装:** `@modelcontextprotocol/sdk` 公式SDK

### 8.2 接続設定

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["ubp", "mcp-server"],
      "cwd": "/path/to/project"
    }
  }
}
```

### 8.3 ツール定義

#### 8.3.1 `ubp_search` - Graph-Aware セマンティック検索

Graph-Aware Retrieval によるハイブリッド検索を実行する。ベクトル類似度とグラフ近接度を組み合わせたスコアリングで、関連性の高いページを返す。関連ページのリンク情報と鮮度情報も含めて返す。

```typescript
// Input
{
    query: string;              // 検索クエリ（自然言語）
    limit?: number;             // 最大取得件数（デフォルト: 5、最大: 20）
    include_linked?: boolean;   // リンク先ページも含めるか（デフォルト: true）
    depth?: number;             // リンク探索の深さ（デフォルト: 1）
    max_tokens?: number;        // レスポンスの最大トークン数目安（Context Window Budget）
}

// Output
{
    results: Array<{
        page: {
            id: string;
            title: string;
            body: string;
            updated_at: string;
            staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        };
        score: number;              // ハイブリッドスコア（0.0 - 1.0）
        score_breakdown: {
            vector_similarity: number;  // ベクトル類似度（0.0 - 1.0）
            graph_proximity: number;    // グラフ近接度（0.0 - 1.0）
        };
        relevance_reason: "direct_link" | "2hop" | "vector_similarity";  // この結果が返された主な理由
        linked_pages: Array<{
            id: string;
            title: string;
            body: string;
            link_type: string;
            link_context: string;
            staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        }>;
    }>;
    total_pages: number;
}
```

**スコアリングアルゴリズム:**
- `final_score = α * vector_similarity + (1 - α) * graph_proximity`（α = 0.7）
- `graph_proximity`: 検索結果のトップヒットからのリンクホップ距離の逆数。直接リンクされたページは高スコア、遠いページは低スコアとなる

**Context Window Budget:** `max_tokens` が指定された場合、レスポンス全体が指定トークン数に収まるよう、ページのbodyを先頭から切り詰める。AIがコンテキストウィンドウを効率的に使うための機能

**Contextual Chunking（将来拡張）:** Phase 0ではページ全体を1ベクトルとするが、長大なページでは検索精度が低下する。将来的にはMarkdownの見出し構造（`##`、`###`）をベースにセクション単位でベクトル化し、より細粒度の検索を可能にする。セクション単位ベクトルは `page_section_vectors` テーブルに格納し、ページ単位ベクトルと併用するハイブリッド方式を検討する

#### 8.3.2 `ubp_fulltext_search` - 全文検索

キーワードによる全文検索。正確な用語や固有名詞での検索に適している。

```typescript
// Input
{
    query: string;              // 検索クエリ（キーワード）
    limit?: number;             // 最大取得件数（デフォルト: 10）
}

// Output
{
    results: Array<{
        page: {
            id: string;
            title: string;
            body: string;
        };
        rank: number;
        snippet: string;        // マッチ箇所の抜粋
    }>;
}
```

#### 8.3.3 `ubp_get_page` - ページ取得

タイトルまたはIDでページを取得する。リンク構造と鮮度情報も含む。

```typescript
// Input
{
    title?: string;
    id?: string;
}

// Output
{
    page: {
        id: string;
        title: string;
        body: string;
        created_at: string;
        updated_at: string;
        staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        stale_refs?: Array<{        // staleness が stale/possibly_stale の場合のみ
            file_path: string;
            last_modified: string;
        }>;
    };
    outgoing_links: LinkInfo[];
    incoming_links: LinkInfo[];
}
```

**鮮度情報:** AIに対してドキュメントの信頼性を伝達する。`stale` のページから取得した情報は、AIが「古い可能性がある」と認識した上で利用できる

#### 8.3.4 `ubp_get_context` - コンテキスト一括取得

指定ページとその関連ページの内容を一括で取得する。AIが1回のツール呼び出しで十分なコンテキストを得るためのユーティリティ。

```typescript
// Input
{
    page_id: string;
    depth?: number;             // グラフ探索の深さ（デフォルト: 1、最大: 3）
}

// Output
{
    center_page: {
        id: string;
        title: string;
        body: string;
    };
    related_pages: Array<{
        id: string;
        title: string;
        body: string;
        relation: string;       // "outgoing" | "incoming"
        depth: number;
        link_context: string;
    }>;
    total_size_bytes: number;
}
```

**レスポンスサイズ制限:** 1回のレスポンスで最大50KBまで。超過する場合はページのbodyを先頭500文字に切り詰める。

#### 8.3.5 `ubp_list_pages` - ページ一覧

全ページの一覧をメタデータのみで取得する。

```typescript
// Input
{
    sort_by?: "title" | "updated_at" | "created_at";
    order?: "asc" | "desc";
}

// Output
{
    pages: Array<{
        id: string;
        title: string;
        updated_at: string;
        outgoing_link_count: number;
        incoming_link_count: number;
    }>;
    total_count: number;
}
```

#### 8.3.6 `ubp_get_graph` - グラフ構造取得

ページ間のリンク構造をグラフとして取得する。

```typescript
// Input
{
    center_page_id?: string;
    depth?: number;             // デフォルト: 2、最大: 5
}

// Output
{
    nodes: Array<{
        id: string;
        title: string;
        link_count: number;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type: string;
    }>;
}
```

### 8.4 Phase 2 で追加予定のツール

| ツール | 概要 |
|--------|------|
| `ubp_create_page` | 新規ページ作成。本文中の `[[Link]]` を自動解析 |
| `ubp_update_page` | 既存ページの更新（全文置換 or 末尾追記） |
| `ubp_check_staleness` | 指定ページまたは全ページの鮮度チェック。staleページの一覧と変更されたコードファイルの情報を返す |
| `ubp_suggest_links` | 暗黙リンク候補の取得。ベクトル類似度が高いがリンクされていないページペアを返す |
| `ubp_graph_traverse` | 指定ノードからN-hop探索。エッジタイプ（`depends_on`, `implements` 等）でフィルタ可能。影響範囲の把握に使用 |
| `ubp_get_impact` | ページ変更時の影響範囲推定。指定ページへの incoming_links を再帰的に探索し、変更の影響を受ける可能性のあるページを返す |

**Phase 2 での書き込み系ツール追加時の安全対策:**
- AIによる変更の監査ログを記録する（`audit_log` テーブルに操作内容を記録）
- 変更前後のdiff表示機能を提供する（AI変更レビューUI）
- Git PRライクな承認/修正/却下のワークフローをUI上で提供する
- 特定ページのAI編集ロック機能を提供する
- レートリミット（1分間あたりの最大操作回数）を設定可能にする

---

## 9. UI/UX要件

### 9.1 画面構成（Phase 1）

```
+----------------------------------------------------------+
|  [ロゴ] [検索バー (Cmd+K)]           [設定] [テーマ切替]  |
+----------+-----------------------------------------------+
|          |                                               |
| サイド   |  メインエディタ領域 (CodeMirror 6)             |
| パネル   |                                               |
|          |  +-------------------------------------------+ |
| - ページ |  | # ページタイトル                          | |
|   一覧   |  |                                           | |
| - お気に |  | 本文...                                   | |
|   入り   |  | [[リンク]] がハイライト表示される           | |
| - 最近   |  |                                           | |
|   開いた |  +-------------------------------------------+ |
|   ページ |  | バックリンク: このページを参照するページ   | |
|          |  +-------------------------------------------+ |
|          |                                               |
+----------+-----------------------------------------------+
|  保存状態インジケータ          | ページ統計（リンク数等）  |
+----------------------------------------------------------+
```

### 9.2 キーボードショートカット

| 操作 | macOS | Windows/Linux |
|------|-------|---------------|
| グローバル検索 | Cmd+K | Ctrl+K |
| ページ保存（強制） | Cmd+S | Ctrl+S |
| サイドバー表示切替 | Cmd+B | Ctrl+B |
| フォーカスモード | Cmd+Shift+F | Ctrl+Shift+F |
| 新規ページ作成 | Cmd+N | Ctrl+N |
| 前のページに戻る | Cmd+[ | Alt+Left |
| 次のページに進む | Cmd+] | Alt+Right |

### 9.3 Empty State（空の状態）

初回起動時に以下を表示する:
- プロジェクトの状態（ページ数: 0）
- 「最初のページを作成する」ボタン
- クイックスタートガイド（インラインで表示）

### 9.4 アクセシビリティ（MVP最低要件）

- 全ての主要機能にキーボードショートカットを提供
- Tab/Shift+Tab によるフォーカス移動が論理的な順序で行われること
- テキストと背景のコントラスト比 4.5:1 以上（WCAG AA）
- ダークモード/ライトモードの切り替え対応

### 9.5 パフォーマンスUX

- 自動保存インジケータの常時表示
- 検索結果のインクリメンタル表示（入力中にリアルタイムで更新）
- ページ切り替え時のスケルトンローディング

---

## 10. リスクと軽減策

| # | リスク | 影響度 | 軽減策 |
|---|--------|--------|--------|
| 1 | ローカルEmbeddingの日本語精度が不十分 | 高 | MVPで `all-MiniLM-L6-v2` を検証し、精度不足の場合は `paraphrase-multilingual-MiniLM-L12-v2` へ移行。FTS5による全文検索をフォールバックとして常時提供 |
| 2 | `[[Link]]` のみでは構造化の粒度が粗い | 中 | Phase 1 でリンクラベル記法（`[[ページ|depends_on]]`）を導入。暗黙リンクの自動提案でリンク漏れを軽減。NLPベースの暗黙的関係抽出はPhase 2以降 |
| 3 | Obsidian + プラグインとの差別化が不十分 | 高 | Phase 0でCLIツール + MCP Server のコアバリューを最速で検証。ユーザーフィードバックに基づき差別化ポイントを強化 |
| 4 | MVPの開発範囲が広すぎる | 高 | Phase 0（CLIツール）でコアバリューを検証してからPhase 1に進む。エディタの自作はPhase 0の結果次第で判断 |
| 5 | CodeMirror 6 の日本語IME対応不具合 | 中 | 早期にIMEテストを実施。問題発生時はProseMirror（TipTap）ベースに切り替え |
| 6 | 1000ページ規模でのパフォーマンス劣化 | 中 | Embedding生成の非同期化を必須とする。差分更新（Incremental Update）でリパースを最小化。SQLiteのPRAGMAチューニングを適用 |
| 7 | 外部エディタとの同時編集によるデータ不整合 | 中 | chokidar によるファイル監視で外部変更を検知。Last Write Wins で十分（Local First の個人利用前提） |
| 8 | AI（MCP経由）による意図しない大量ページ生成 | 中 | Phase 2での書き込み系ツール追加時に、レートリミットと確認プロンプトを導入 |
| 9 | ファイル名の日本語によるクロスプラットフォーム問題 | 低 | 主要OS（macOS/Linux/Windows）は日本語ファイル名対応。問題が出た場合はslug化に移行 |
| 10 | SQLiteメタデータDBの破損 | 低 | `ubp rebuild` コマンドで全再構築可能。ソースはMarkdownファイル群であり、データロスは発生しない |
| 11 | コードとドキュメントの乖離（課題4） | 高 | Staleness Detection で鮮度を自動検知。`ubp stale --exit-code` による Git pre-commit フック連携で、stale なドキュメントがある状態でのコミットを警告。CI/CDパイプラインへの組み込みも可能 |
| 12 | 自動構造化の精度が不十分（課題3） | 中 | Phase 0 では `[[Link]]` ベースの明示的リンクのみで検証し、精度リスクを最小化。暗黙リンク提案（ベクトル類似度ベース）は Phase 1 で導入し、ユーザーの承認/却下を必須とすることで誤った構造化を防止。将来的には構造化確信度スコアにより低確信度の構造をユーザーにレビュー依頼する仕組みを検討 |

---

## 11. 今後の検討事項

### 11.1 設計フェーズで決定すべき事項

| # | 事項 | 期限 |
|---|------|------|
| 1 | Phase 1 の Webフレームワーク選定（Next.js / SvelteKit / Vite + React 等） | Phase 0 完了後 |
| 2 | ページファイル名の命名規則（日本語そのまま vs slug化） | Phase 0 開発開始前 |
| 3 | Embeddingモデルの日本語精度ベンチマーク | Phase 0 開発中 |
| 4 | MCP Server の書き込み系ツール（create/update）の安全設計 | Phase 1 完了後 |

### 11.2 長期的な検討課題

- **Obsidianプラグイン版:** 独立プロダクトではなくObsidianプラグインとしても提供する可能性を検討
- **マルチユーザー対応:** CRDTベース（Yjs等）の同時編集。Local Firstの思想との両立方法
- **NLPベースの暗黙的構造化:** `[[Link]]` 以外の自然言語からの関係抽出。精度と信頼性の要件定義
- **ベクトルDBのスケーリング:** 10000ページ以上への対応時に sqlite-vec 等のインデックスベース検索への移行
- **Embeddingモデルの更新戦略:** モデル変更時の全ベクトル再計算の自動化（manifest.jsonにモデルバージョンを記録し、ubp rebuild で再生成）
- **ページ削除のセマンティクス:** 削除されたページへの `[[Link]]` は「リンク切れ」状態として保持し、UIで警告表示する方針
- **循環参照の扱い:** グラフは有向グラフとして循環参照を許容する。UIで循環の検出・警告を提供
- **テスト戦略:** 各コンポーネント（パーサー、ベクトルエンジン、MCP Server）の単体テスト・統合テスト戦略を早期に確立。特にMCP Serverはプロトコル仕様への準拠テストが重要
- **Graph-Aware Retrieval のα値チューニング:** ベクトル類似度とグラフ近接度のバランス（α = 0.7）は、実データでのA/Bテストに基づいて調整する
- **鮮度検出の閾値最適化:** Stale判定の日数閾値（現在7日）はプロジェクト規模や開発速度に応じてカスタマイズ可能にする
- **Git pre-commit フック連携:** `ubp stale --exit-code` をCI/CDパイプラインや pre-commit フックに組み込む運用パターンの確立
