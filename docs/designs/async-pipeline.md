---
title: 非同期パイプライン設計
doc_type: design
source_refs:
  - src/core/watcher/file-watcher.ts
  - src/core/watcher/change-processor.ts
  - src/core/watcher/debouncer.ts
  - src/core/embedding/embedding-queue.ts
  - src/core/parser/markdown-parser.ts
  - src/core/parser/section-splitter.ts
---

# 非同期パイプライン設計

ファイル変更の検出からEmbedding生成までの非同期パイプラインを定義する。

## 全体フロー

```
ファイル変更
    │
    ▼
FileWatcher (chokidar)
    │  add / change / unlink イベント
    ▼
Debouncer (500ms)
    │  バッチ化された変更
    ▼
ChangeProcessor
    │
    ├── MarkdownParser (unified/remark)
    │     ├── FrontmatterParser (YAML)
    │     ├── SectionSplitter (H2/H3境界)
    │     └── WikiLinkExtractor ([[target|type]])
    │
    ├── DocumentRepository.upsert()
    │     └── body_hash 比較で変更検出
    │
    ├── SectionRepository.replaceByDocId()
    │     └── content_hash 比較で差分更新
    │
    ├── LinkResolver.resolve()
    │     ├── ファイルパスマッチング
    │     └── ダングリングリンク自動解決
    │
    ├── SourceRefsState.sync()
    │     └── SHA-256ハッシュ更新
    │
    └── EmbeddingQueue.enqueue()
          │  新規・変更セクションのみ
          ▼
    EmbeddingQueue (非同期バッチ処理)
          │  バッチサイズ: 32
          ▼
    VectorIndex.upsert() + SectionRepository.updateEmbedding()
```

## ファイル監視

### FileWatcher

chokidarによるファイルシステム監視。

- **監視対象**: `config.docs_dir`配下の`*.md`ファイル
- **除外パターン**: `config.source.exclude`（デフォルト: `node_modules`, `dist`, `.git`）
- **イベント**: `add`（新規）、`change`（変更）、`unlink`（削除）
- **パストラバーサル防止**: `docs_dir`の外を指すパスは無視

### Debouncer

短時間の連続変更をバッチ化する。

- **デバウンス間隔**: 500ms
- 同一ファイルへの連続変更は最後のイベントのみ処理
- ファイル保存時の一時ファイル書き込み等のノイズを排除

## Markdownパース

### MarkdownParser

unified/remarkパイプラインによるMarkdown解析。

処理順序:
1. `remark-parse`でAST生成
2. `remark-frontmatter`でフロントマター抽出
3. `FrontmatterParser`でYAML解析・バリデーション
4. `SectionSplitter`でセクション分割
5. `WikiLinkExtractor`でリンク抽出

返却値: `ParseResult`（frontmatter, sections, links, title）

### タイトル解決

タイトルの優先順位:
1. フロントマターの`title`フィールド
2. 本文中の最初のH1見出し
3. ファイル名（拡張子除去）

### FrontmatterParser

YAMLフロントマターの解析とバリデーション。

```yaml
---
title: ドキュメントタイトル
doc_type: design
source_refs:
  - src/core/engine.ts
  - src/shared/types.ts
---
```

- `doc_type`: 不正な値はwarning付きで`other`にフォールバック
- `source_refs`: 各パスに対してパストラバーサルチェック（`..`を含むパスは警告して除外）
- 未定義フィールドは無視する（厳密なスキーマ検証は行わない）

### SectionSplitter

H2/H3見出しでセクションに分割する。

**分割ルール**:
1. H2/H3が境界。H1はタイトル、H4以下は親セクションに含む
2. 最初のH2前の内容 → `section_order=0`, `heading=null`
3. 各セクションの`section_order`は0から連番

**動的サイズ調整**:
- 256トークン超 → 段落（空行）で動的サブ分割
- 32トークン未満 → 前のセクションにマージ
- トークン数推定: CJK文字×1.5 + 英語単語×1.3

### WikiLinkExtractor

remarkプラグインとして動作し、`[[target]]`および`[[target|type]]`パターンを抽出する。

- コードブロック内のWikiLinkは無視
- リンク周辺50文字のコンテキストを抽出
- 無効なリンク種別はwarning付きで`references`にフォールバック

## 変更処理

### ChangeProcessor

ファイル変更をデータベース更新に変換するパイプライン。

#### processFile(filepath, content, options)

1. **パース**: `MarkdownParser.parse(content)` → ParseResult
2. **ドキュメントupsert**: body_hash比較。変更なしかつ`forceUpdate=false`ならスキップ
3. **セクション置換**: `SectionRepository.replaceByDocId()` で差分更新。content_hashが一致するセクションはembeddingを保持
4. **リンク解決**: `LinkResolver`でWikiLinkをファイルパスに変換。未解決はダングリングリンクとして保存
5. **ダングリングリンク再解決**: 新規ドキュメント追加時に既存のダングリングリンクをタイトル/ベースネームで再解決
6. **source_refs同期**: ソースファイルのSHA-256ハッシュを計算・保存
7. **Embeddingキュー投入**: embedding未生成またはcontent変更のセクションをキューに追加

返却値: `{ docId, sectionsCreated, linksResolved, linksDangling, embeddingsQueued, skipped }`

#### processChange(FileChangeEvent)

- `add` / `change`: ファイルを読み込んでprocessFileを呼び出す
- `unlink`: ドキュメント・セクション・リンクを削除し、VectorIndexからも除去

## リンク解決

### LinkResolver

WikiLinkのターゲット名からファイルパスを解決する。

**マッチング戦略**（優先順位順）:
1. 完全パスマッチ（`path/to/file.md`）
2. ベースネームマッチ（`.md`拡張子の有無を考慮）
3. タイトルマッチ（全ドキュメントのタイトルから検索）

**ダングリングリンク再解決**: 新規ドキュメントが追加された際に、そのタイトル/ベースネームに一致する未解決リンクを自動的に解決する。

## Embeddingキュー

### EmbeddingQueue

バックグラウンドで非同期にEmbeddingを生成するジョブキュー。

- **バッチサイズ**: 32（`config.embedding.batch_size`）
- **処理フロー**: enqueue → バッチ生成 → DB保存 → VectorIndex更新
- **エラーハンドリング**: バッチ全体の失敗時は個別リトライにフォールバック
- **イベント通知**: `queue:progress`（進捗）、`queue:complete`（完了）

### Embeddingの保存先

1. `SectionRepository.updateEmbedding(id, buffer, model)` — BLOBとして永続化
2. `VectorIndex.upsert(sectionId, docId, embedding)` — インメモリインデックスに追加

### 差分Embedding

content_hashが変更されたセクションのみEmbeddingを再生成する。ドキュメントの軽微な修正（タイプミス修正等）では、変更されたセクションのみが再処理され、他のセクションのembeddingは保持される。

## メモリ管理

- ベクトルインデックスは`Float32Array`でインメモリ保持。1000ドキュメント・3000セクション・1024次元の場合、約12MBのメモリ使用量
- SQLiteのmmap_sizeは256MBに制限
- Embeddingバッチサイズ32でメモリ消費を制御
- 遅延コンパクション（20%の空きエントリでトリガー）でインデックスの肥大化を防止
