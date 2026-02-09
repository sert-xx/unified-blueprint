---
title: データベース設計
doc_type: design
source_refs:
  - src/data/migrations/001-initial-schema.ts
  - src/data/database-manager.ts
  - src/data/vector-index.ts
---

# データベース設計

SQLite（better-sqlite3）をデータストアとして使用する。インメモリVectorIndexによるベクトル検索とFTS5仮想テーブルによる全文検索を組み合わせる。

## データベース接続設定

`DatabaseManager`が初期化時に以下のPRAGMAを設定する。

```sql
PRAGMA journal_mode = WAL;      -- 読み取り並行性の確保
PRAGMA synchronous = NORMAL;    -- WALモードでの安全な書き込み
PRAGMA cache_size = -64000;     -- キャッシュ64MB
PRAGMA mmap_size = 268435456;   -- mmap 256MB
PRAGMA foreign_keys = ON;       -- 外部キー制約有効化
```

データベースファイルは`.ubp/knowledge.db`に保存される。

## ER図

```
documents 1──N sections 1──0..1 embedding (BLOB)
    │                │
    │                └──N sections_fts (FTS5仮想テーブル)
    │
    ├──N links (source_doc_id)
    │      │
    │      └──0..1 links (target_doc_id) → documents
    │
    └──N source_refs_state
```

## テーブル定義

### documents

ドキュメントのメタデータを格納する主テーブル。

```sql
CREATE TABLE documents (
    id          TEXT    PRIMARY KEY,         -- UUID v4
    filepath    TEXT    NOT NULL UNIQUE,     -- docs_dir からの相対パス
    title       TEXT    NOT NULL,            -- ドキュメントタイトル
    doc_type    TEXT    NOT NULL DEFAULT 'spec'
                        CHECK(doc_type IN ('spec','design','db-schema','api','config','guide')),
    body_hash   TEXT    NOT NULL,            -- SHA-256（変更検出用）
    created_at  TEXT    NOT NULL,            -- ISO 8601
    updated_at  TEXT    NOT NULL             -- ISO 8601
);
```

インデックス:
- `idx_documents_filepath` — filepath検索用
- `idx_documents_title` — タイトル検索用
- `idx_documents_updated_at` — 更新日時ソート用
- `idx_documents_doc_type` — ドキュメント種別フィルタ用

`doc_type`はData Layer固有の6種類（spec, design, db-schema, api, config, guide）を格納する。Shared Layerの`DocType`（spec, design, adr, guide, api, meeting, todo, other）とはInterface Layerで変換する。

### sections

各ドキュメントをH2/H3見出し境界で分割したセクション。Embeddingとfull-text searchの単位となる。

```sql
CREATE TABLE sections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    heading         TEXT,                   -- セクション見出し（NULL = 冒頭部分）
    section_order   INTEGER NOT NULL,       -- ドキュメント内の順序（0始まり）
    content         TEXT    NOT NULL,       -- セクション本文
    content_hash    TEXT    NOT NULL,       -- SHA-256（差分更新用）
    embedding       BLOB,                  -- Float32Array のバイナリ
    embedding_model TEXT,                  -- 生成したモデル名
    token_count     INTEGER,               -- 推定トークン数
    updated_at      TEXT    NOT NULL
);
```

インデックス:
- `idx_sections_doc_id` — ドキュメント別セクション検索
- `idx_sections_heading` — 見出し検索（NULL除外部分インデックス）
- `idx_sections_embedding_model` — モデルマイグレーション用
- `idx_sections_content_hash` — 内容変更検出用
- `idx_sections_doc_order` — (doc_id, section_order) のユニーク制約

#### セクション分割ルール

1. H2/H3見出しがセクション境界となる
2. 最初のH2より前の内容は`section_order=0`、`heading=NULL`で格納
3. H1はタイトルとして扱い、分割境界にならない
4. H4以下は親セクションに含まれる
5. 256トークン超のセクションは段落単位で動的サブ分割する
6. 32トークン未満のセクションは前のセクションにマージする
7. トークン数推定: CJK文字×1.5 + 英語単語×1.3

### links

WikiLinkから抽出されたドキュメント間の関係を格納する。

```sql
CREATE TABLE links (
    source_doc_id       TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_doc_id       TEXT    REFERENCES documents(id) ON DELETE CASCADE,  -- NULL = ダングリングリンク
    type                TEXT    NOT NULL DEFAULT 'references'
                                CHECK(type IN ('references','depends_on','implements','extends','conflicts_with')),
    context             TEXT,               -- リンク周辺50文字のコンテキスト
    source_section_id   INTEGER REFERENCES sections(id) ON DELETE SET NULL,
    target_title        TEXT,               -- 未解決リンクのターゲット名
    created_at          TEXT    NOT NULL
);
```

インデックス:
- `idx_links_pk` — (source_doc_id, COALESCE(target_doc_id, ''), type) のユニーク制約
- `idx_links_target` — ターゲット側検索（NULL除外部分インデックス）
- `idx_links_type` — リンク種別フィルタ
- `idx_links_source_section` — セクション別リンク検索
- `idx_links_dangling` — ダングリングリンク検索（target_doc_id IS NULL）

#### リンク種別

| 種別 | WikiLink記法 | 意味 |
|---|---|---|
| `references` | `[[target]]` | 参照（デフォルト） |
| `depends_on` | `[[target\|depends_on]]` | 依存関係 |
| `implements` | `[[target\|implements]]` | 実装 |
| `extends` | `[[target\|extends]]` | 拡張 |
| `conflicts_with` | `[[target\|conflicts_with]]` | 競合 |

#### ダングリングリンク

`target_doc_id`がNULLのリンクはダングリングリンク（未解決リンク）。`target_title`にWikiLinkの記述名を保持する。新しいドキュメントが追加された際に、`LinkResolver`がタイトル・ベースネームマッチングで自動解決する。

### source_refs_state

ドキュメントが参照するソースコードの陳腐化追跡テーブル。

```sql
CREATE TABLE source_refs_state (
    doc_id              TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    file_path           TEXT    NOT NULL,       -- ソースファイルパス
    last_synced_hash    TEXT,                   -- 最終同期時のSHA-256
    last_synced_at      TEXT,                   -- 最終同期日時
    is_stale            INTEGER NOT NULL DEFAULT 0
                                CHECK(is_stale IN (0, 1)),
    PRIMARY KEY (doc_id, file_path)
);
```

インデックス:
- `idx_source_refs_stale` — 陳腐化レコード検索（is_stale=1の部分インデックス）

詳細は[[staleness-detection|depends_on]]を参照。

## FTS5全文検索

### 仮想テーブル

```sql
CREATE VIRTUAL TABLE sections_fts USING fts5(
    heading,
    content,
    content='sections',
    content_rowid='id',
    tokenize='trigram'
);
```

**trigramトークナイザー**を採用。3文字のN-gramで分割するため、日本語（CJK文字）のサブストリング検索が可能。unicode61トークナイザーでは日本語テキスト全体が単一トークンとして扱われ検索不能だったが、trigramにより「陳腐化」「設計」等の日本語キーワード検索が正しく動作する。

### 同期トリガー

sectionsテーブルの挿入・更新・削除時にFTS5インデックスを自動同期するトリガーを定義する。

```sql
-- INSERT: 新しいセクション追加時
CREATE TRIGGER sections_fts_insert AFTER INSERT ON sections BEGIN
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

-- UPDATE: heading または content 変更時
CREATE TRIGGER sections_fts_update AFTER UPDATE OF heading, content ON sections BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

-- DELETE: セクション削除時
CREATE TRIGGER sections_fts_delete AFTER DELETE ON sections BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
END;
```

### FTS5クエリサニタイズ

`FulltextSearchService`がFTS5インジェクション防止のためトークンベースのサニタイズを行う。各トークンをダブルクォートで囲み、内部のクォートはエスケープする。AND/OR/NOT/NEAR等のFTS5演算子も無効化される。

## インメモリ Vector Index

`VectorIndex`はSQLiteのsectionsテーブルに永続化されたembeddingをアプリケーション起動時にメモリに読み込み、ブルートフォースのコサイン類似度検索を行う。

### 主要仕様

- **次元数自動検出**: 最初のupsertまたはloadFromDatabaseで次元数を自動判定（デフォルト0）
- **正規化済みベクトル**: EmbeddingProviderが正規化済みベクトルを返すため、ドット積＝コサイン類似度
- **遅延コンパクション**: 削除エントリが全体の20%を超えた場合にコンパクションを実行
- **永続化**: embeddingはsectionsテーブルのBLOB列に`Buffer`として保存

### 操作

| メソッド | 説明 |
|---|---|
| `loadFromDatabase(db)` | DB起動時にembeddingを一括ロード |
| `upsert(sectionId, docId, embedding)` | ベクトルの追加・更新 |
| `removeByDocId(docId)` | ドキュメント削除時のベクトル一括削除 |
| `search(queryEmbedding, topK)` | コサイン類似度による上位K件検索 |

## リポジトリ層

`DatabaseManager`が以下のリポジトリとサービスを遅延初期化で管理する。

### DocumentRepository

- `findById(id)` / `findByFilepath(filepath)` / `findByTitle(title)` / `findAll(options?)`
- `upsert(doc)` — body_hash比較で変更検出。変更なしの場合はスキップ
- `deleteById(id)` / `deleteNotIn(filepaths)` — 削除されたファイルのクリーンアップ

### SectionRepository

- `findByDocId(docId)` / `findById(id)` / `count()` / `countWithEmbedding()`
- `findPendingEmbeddings()` — embedding IS NULLのセクション取得
- `findByEmbeddingModelNot(model)` — モデルマイグレーション用
- `replaceByDocId(docId, sections)` — content_hash比較で差分更新
- `updateEmbedding(id, buffer, model)` — Embedding生成後の更新

### LinkRepository

- `findBySourceDocId(docId)` / `findByTargetDocId(docId)` / `count()`
- `replaceBySourceDocId(docId, links)` — ドキュメントのリンク全置換
- `findDangling()` / `resolveDangling(targetTitle, targetDocId)` — ダングリングリンク管理

### SourceRefsStateRepository

- `findByDocId(docId)` / `findStale()`
- `syncByDocId(docId, refs)` — source_refsハッシュの更新
- `updateStaleness(docId, filePath, isStale)` — 陳腐化フラグ更新
- `summary()` — fresh/stale/total の集計

### GraphQueryService

- `traverseBidirectional(docId, depth)` — 再帰CTEによるN-hopグラフ走査
- `getGraphStructure(centerDocId?, depth)` — グラフのノード・エッジ構造取得

### FulltextSearchService

- `search(query, limit)` — FTS5クエリ実行。snippet()関数で64文字のハイライト付きスニペット返却

## マイグレーション戦略

スキーマ変更は`src/data/migrations/`に番号付きマイグレーションファイルで管理する。`schema_version`テーブルで適用済みバージョンを追跡し、未適用のマイグレーションを起動時に順次適用する。

現在のバージョン: **v1**（初期スキーマ）

## StatementCache

`StatementCache`がプリペアドステートメントをキーでキャッシュし、繰り返しクエリのprepareオーバーヘッドを削減する。`DatabaseManager`のclose時に全キャッシュをクリアする。
