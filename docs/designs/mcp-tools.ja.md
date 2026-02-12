---
title: MCPツール仕様
doc_type: api
source_refs:
  - src/interface/mcp/server.ts
  - src/interface/mcp/tools/index.ts
  - src/interface/mcp/tools/ubp-search.ts
  - src/interface/mcp/tools/ubp-get-page.ts
  - src/interface/mcp/tools/ubp-get-context.ts
  - src/interface/mcp/tools/ubp-fulltext-search.ts
  - src/interface/mcp/tools/ubp-list-pages.ts
  - src/interface/mcp/tools/ubp-get-graph.ts
---

[English](./mcp-tools.md)

# MCPツール仕様

Model Context Protocol（MCP）で公開するツール群を定義する。`@modelcontextprotocol/sdk`を使用し、stdio経由でAIエージェント（Claude Desktop、Cursor等）と連携する。

## MCPサーバー構成

MCPサーバーは`ubp serve`コマンドで起動する。stdioトランスポートを使用し、プロセスロック（`.ubp/serve.lock`）で多重起動を防止する。ファイル監視を同時に開始し、ドキュメント変更をリアルタイムでインデックスに反映する。

エラー応答はJSON-RPC形式で返し、スタックトレースは含めない。MCPエラーコード:
- `-32602`: 無効なパラメータ
- `-32603`: 内部エラー

## ツール一覧

### ubp_search

Graph-Awareセマンティック検索を実行する。ベクトル類似度・グラフ近接度・FTS5スコアを統合した3-Wayハイブリッドスコアリングで最適な結果を返す。

**パラメータ**:

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `query` | string | Yes | - | 検索クエリテキスト |
| `limit` | number | No | 10 | 返却件数上限（1〜20） |
| `include_linked` | boolean | No | false | 関連ページの展開 |
| `depth` | number | No | 2 | グラフ走査深度（1〜3） |
| `link_types` | string[] | No | - | リンク種別フィルタ |

**レスポンス**: `SearchOutput`

```typescript
{
  results: [{
    doc_id: string,
    filepath: string,
    title: string,
    sections: [{ section_id, heading, content, score }],
    score: number,
    score_breakdown: { vector_similarity, graph_proximity },
    relevance_reason: string,
    staleness: 'fresh' | 'possibly_stale' | 'stale' | 'untracked',
    linked_pages?: [{ doc_id, filepath, title, link_type, summary }]
  }],
  total_found: number,
  search_type: 'hybrid' | 'fulltext_fallback'
}
```

実装は[[search-algorithm|implements]]に基づく。

### ubp_get_page

指定されたファイルパスのドキュメントを取得する。全セクションの内容、アウトリンク、バックリンク、陳腐化状態を含む完全な情報を返す。

**パラメータ**:

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `filepath` | string | Yes | ドキュメントのファイルパス（docs_dirからの相対パス） |

**レスポンス**: `GetPageOutput`

```typescript
{
  doc_id: string,
  filepath: string,
  title: string,
  doc_type: DocType,
  content: string,               // 全セクション結合テキスト
  sections: [{ heading, content }],
  outlinks: [{ doc_id, filepath, title, link_type }],
  backlinks: [{ doc_id, filepath, title, link_type }],
  staleness: StalenessLevel,
  stale_refs: string[],          // 陳腐化したソースファイルパス
  updated_at: string
}
```

### ubp_get_context

ドキュメントとそのグラフ近傍をまとめて取得する。AIエージェントがコンテキストウィンドウに必要な情報を効率的に取得できるよう設計されている。

**パラメータ**:

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `filepath` | string | Yes | - | 中心ドキュメントのファイルパス |
| `depth` | number | No | 2 | グラフ走査深度（1〜3） |
| `max_size` | number | No | 50000 | 最大出力文字数 |

**レスポンス**: `GetContextOutput`

```typescript
{
  center: {
    doc_id: string,
    filepath: string,
    title: string,
    content: string                // 全セクション結合テキスト
  },
  related: [{
    doc_id: string,
    filepath: string,
    title: string,
    link_type: LinkType,
    direction: 'outlink' | 'backlink',
    summary: string,               // 先頭500文字
    depth: number
  }],
  total_size: number,
  truncated_count: number          // max_sizeで省略されたドキュメント数
}
```

`max_size`を超える場合、関連ドキュメントを省略し`truncated_count`で通知する。

### ubp_fulltext_search

FTS5による全文キーワード検索。trigramトークナイザーにより日本語のサブストリング検索にも対応する。Embeddingが利用できない場合の代替手段としても機能する。

**パラメータ**:

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `query` | string | Yes | - | 検索キーワード |
| `limit` | number | No | 10 | 返却件数上限（1〜50） |
| `doc_type` | string | No | - | ドキュメント種別フィルタ |

**レスポンス**: `FulltextSearchOutput`

```typescript
{
  results: [{
    doc_id: string,
    filepath: string,
    title: string,
    section_heading: string | null,
    snippet: string,               // 64文字のハイライト付きスニペット
    rank: number
  }],
  total_found: number
}
```

### ubp_list_pages

インデックス済みの全ドキュメントを一覧する。ドキュメント種別でのフィルタリングと、タイトル・更新日時・ファイルパスでのソートに対応する。

**パラメータ**:

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `doc_type` | string | No | - | ドキュメント種別フィルタ |
| `sort` | string | No | `"title"` | ソートキー: title / updated_at / filepath |
| `order` | string | No | `"asc"` | ソート順: asc / desc |

**レスポンス**: `ListPagesOutput`

```typescript
{
  pages: [{
    doc_id: string,
    filepath: string,
    title: string,
    doc_type: DocType,
    link_count: number,
    updated_at: string
  }],
  total: number
}
```

### ubp_get_graph

ドキュメントグラフの構造（ノードとエッジ）を返す。全体グラフまたは特定ドキュメントを中心としたサブグラフを取得できる。

**パラメータ**:

| 名前 | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `center` | string | No | - | 中心ドキュメント（filepath or doc_id） |
| `depth` | number | No | 2 | グラフ走査深度（1〜5） |

**レスポンス**: `GetGraphOutput`

```typescript
{
  nodes: [{
    id: string,
    filepath: string,
    title: string,
    doc_type: DocType
  }],
  edges: [{
    source: string,              // source doc_id
    target: string,              // target doc_id
    type: LinkType               // リンク種別
  }]
}
```

`center`未指定の場合は全ドキュメントのグラフを返す。[[database-schema]]のlinksテーブルから構築される。

## AIエージェント向け利用パターン

### コンテキスト収集

```
1. ubp_search("検索クエリ") → 関連ドキュメント特定
2. ubp_get_context(filepath, depth=2) → 中心 + 関連ドキュメント取得
3. コンテキストウィンドウに投入して回答生成
```

### ドキュメント探索

```
1. ubp_list_pages(doc_type="design") → 設計ドキュメント一覧
2. ubp_get_page(filepath) → 詳細閲覧
3. ubp_get_graph(center=filepath) → 依存関係確認
```

### 鮮度チェック

```
1. ubp_get_page(filepath) → staleness + stale_refs 確認
2. 陳腐化の原因となるソースファイルの変更内容を確認
3. ドキュメント更新を提案
```
