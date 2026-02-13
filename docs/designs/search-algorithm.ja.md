---
title: 検索アルゴリズム設計
doc_type: spec
source_refs:
  - src/core/search/hybrid-search.ts
  - src/core/search/vector-search.ts
  - src/core/search/fulltext-search.ts
  - src/core/graph/graph-traversal.ts
  - src/core/graph/graph-scorer.ts
---

[English](./search-algorithm.md)

# 検索アルゴリズム設計

Graph-Aware 3-Way ハイブリッド検索のアルゴリズムを定義する。ベクトル類似度、グラフ近接度、FTS5全文検索スコアの3つのシグナルを統合したスコアリングにより、意味的に関連性が高く、かつドキュメントグラフの構造を考慮した検索結果を返す。

## スコアリング式

```
final_score = α × vector_similarity + β × graph_proximity + γ × fts5_score
```

ここで:
- **α（alpha）**: ベクトル類似度の重み。デフォルト`0.7`（`config.search.alpha`）
- **β（beta）**: グラフ近接度の重み。`(1 - α) - γ`
- **γ（gamma）**: FTS5スコアの重み。FTS5ヒットがある場合 `(1 - α) × 0.3`、ない場合 `0`

FTS5ヒットがない場合は2-wayスコアリング（α=0.7, β=0.3）に退化する。FTS5ヒットがある場合はグラフ重みの30%をFTS5に割り当て（α=0.7, β=0.21, γ=0.09）。

## 検索フロー

```
クエリテキスト
    │
    ▼
Step 1: クエリEmbedding生成
    │  embedQuery() でプレフィックス付与（e5モデルの場合 "query: "）
    ▼
Step 2: ベクトル検索（候補拡大）
    │  limit × 10 件の候補をコサイン類似度で取得
    ▼
Step 2.5: FTS5全文検索
    │  同じクエリでFTS5検索、正規化スコアを算出
    ▼
Step 3: グラフ走査
    │  上位 limit × 2 のユニークなドキュメントIDから
    │  N-hop BFS（depth = config.search.max_depth）
    ▼
Step 4: グラフ近接度算出
    │  1/hop_distance で正規化
    ▼
Step 5: ドキュメント単位集約
    │  セクション別スコアをドキュメント単位にまとめる
    ▼
Step 6: 3-Wayスコア算出
    │  α × vector + β × graph + γ × fts5
    ▼
Step 7: ソート・フィルタ・結果構築
    │  doc_typeフィルタ、staleness付与
    ▼
SearchOutput
```

## 各ステップの詳細

### Step 1: クエリEmbedding生成

EmbeddingProviderの`embedQuery()`メソッドを使用する。instruction-tunedモデル（e5ファミリー）では検索用プレフィックス`"query: "`が自動付与される。`embedQuery`が未定義の場合は通常の`embed()`にフォールバック。

### Step 2: ベクトル検索

VectorIndexに対してブルートフォースのコサイン類似度検索を実行する。正規化済みベクトルのドット積で計算するため、追加の正規化処理は不要。

候補数は`limit × 10`に拡大して取得し、後段のグラフ・FTS5スコアリングで再ランキングする。

### Step 2.5: FTS5全文検索

同一クエリでFTS5検索を実行し、キーワードマッチのシグナルを取得する。

FTS5スコアの正規化:
```
normalized_fts5_score = |rank| / max_rank    (0.0 〜 1.0)
```

FTS5のrankは負の値（小さいほど良い）のため、絶対値を取って最大値で正規化する。同一ドキュメントの複数セクションヒットでは最高スコアを採用する。

trigramトークナイザーにより日本語のサブストリング検索にも対応する。

### Step 3: グラフ走査

上位`limit × 2`件のユニークなドキュメントIDを起点として、`GraphTraversal`がBFS（幅優先探索）で双方向にグラフを走査する。

- **最大深度**: `config.search.max_depth`（デフォルト2）
- **走査方向**: outlink（参照先）とbacklink（被参照）の両方
- **link_typesフィルタ**: SearchInputで指定された場合、指定された種別のリンクのみを走査

### Step 4: グラフ近接度算出

```
graph_proximity(doc) = 1 / hop_distance
```

| ホップ数 | 近接度 |
|---|---|
| 0（自身 / 上位ベクトルヒット） | 1.0 |
| 1 | 1.0 |
| 2 | 0.5 |
| 3 | 0.33 |

上位ベクトルヒット自身は近接度1.0。複数の起点から到達可能な場合は最小ホップ数を採用する。

### Step 5: ドキュメント単位集約

ベクトル検索はセクション単位で結果を返すため、同一ドキュメントの複数セクションを集約する。

**セクション集約ロジック**:
- 単一セクション: そのままvector_similarityとして使用
- 複数セクション: `max × 0.8 + avg_top3 × 0.2`
  - 最大スコアのセクションを重視しつつ、複数セクションが一貫して関連するドキュメントにボーナスを付与

グラフ走査で到達したがベクトル結果に含まれないドキュメントも候補に追加される（vector_similarity=0、graph_proximityのみ）。

### Step 6: 3-Wayスコア算出

```typescript
const hasFtsHits = ftsScoreMap.size > 0;
const gamma = hasFtsHits ? (1 - alpha) * 0.3 : 0;
const beta = (1 - alpha) - gamma;
const finalScore = alpha * vectorSimilarity + beta * graphProximity + gamma * ftsScore;
```

### Step 7: 結果構築

1. finalScoreで降順ソート
2. `doc_type`フィルタ適用（指定時）
3. 上位`limit`件を取得
4. 各ドキュメントについて:
   - 上位3セクションのマッチ情報を付与
   - ベクトルヒットがない場合はドキュメントの先頭セクション（500文字まで）を付与
   - `StalenessDetector`で陳腐化レベルを判定
   - スコア内訳（vector_similarity, graph_proximity）とrelevance_reasonを構築

## フォールバック戦略

### FTS5フォールバック

以下の条件でFTS5全文検索にフォールバックする:

1. **VectorIndex空**: Embeddingモデル未ロードまたは未生成の場合
2. **ベクトル結果0件**: クエリに対するベクトルヒットがない場合
3. **ハイブリッド検索失敗**: エラー発生時

フォールバック時のスコアはFTS5のrankの絶対値をそのまま使用する。`search_type`は`"fulltext_fallback"`となる。

## SearchInput / SearchOutput

### 入力パラメータ

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `query` | string | （必須） | 検索クエリテキスト |
| `limit` | number | 10 | 返却件数上限 |
| `doc_type` | DocType | - | ドキュメント種別フィルタ |
| `include_linked` | boolean | - | 関連ページの展開 |
| `depth` | number | 2 | グラフ走査深度 |
| `link_types` | LinkType[] | - | リンク種別フィルタ |

### 出力

```typescript
interface SearchOutput {
  results: SearchResult[];     // 検索結果配列
  total_found: number;         // フィルタ後の総件数
  search_type: 'hybrid' | 'fulltext_fallback';
}

interface SearchResult {
  doc_id: string;
  filepath: string;
  title: string;
  sections: SectionMatch[];    // 上位3セクション
  score: number;               // final_score
  score_breakdown: {
    vector_similarity: number;
    graph_proximity: number;
  };
  relevance_reason: string;    // スコア内訳の文字列
  staleness: StalenessLevel;
  linked_pages?: LinkedPageSummary[];
}
```

## 性能要件

- 検索レスポンス: 200ms以内（1000ドキュメント規模）
- 候補数を`limit × 10`に制限し、不要なグラフ走査を回避
- ブルートフォースのベクトル検索は正規化済みドット積で高速算出
- グラフ走査はBFSで最大深度を制限（デフォルト2）
- [[architecture]]の非機能要件も参照
