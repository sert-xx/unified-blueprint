---
title: Search Algorithm Design
doc_type: spec
source_refs:
  - src/core/search/hybrid-search.ts
  - src/core/search/vector-search.ts
  - src/core/search/fulltext-search.ts
  - src/core/graph/graph-traversal.ts
  - src/core/graph/graph-scorer.ts
---

[日本語](./search-algorithm.ja.md)

# Search Algorithm Design

Defines the algorithm for Graph-Aware 3-Way hybrid search. By integrating three signals -- vector similarity, graph proximity, and FTS5 full-text search score -- the scoring returns search results that are semantically relevant and take the document graph structure into account.

## Scoring Formula

```
final_score = α × vector_similarity + β × graph_proximity + γ × fts5_score
```

Where:
- **α (alpha)**: Weight for vector similarity. Default `0.7` (`config.search.alpha`)
- **β (beta)**: Weight for graph proximity. `(1 - α) - γ`
- **γ (gamma)**: Weight for FTS5 score. `(1 - α) × 0.3` when FTS5 hits exist, `0` otherwise

When there are no FTS5 hits, the scoring degrades to 2-way scoring (α=0.7, β=0.3). When FTS5 hits exist, 30% of the graph weight is allocated to FTS5 (α=0.7, β=0.21, γ=0.09).

## Search Flow

```
Query text
    │
    ▼
Step 1: Generate query embedding
    │  Add prefix via embedQuery() ("query: " for e5 models)
    ▼
Step 2: Vector search (candidate expansion)
    │  Retrieve limit × 10 candidates by cosine similarity
    ▼
Step 2.5: FTS5 full-text search
    │  Run FTS5 search with the same query, compute normalized scores
    ▼
Step 3: Graph traversal
    │  From top limit × 2 unique document IDs,
    │  N-hop BFS (depth = config.search.max_depth)
    ▼
Step 4: Compute graph proximity
    │  Normalize by 1/hop_distance
    ▼
Step 5: Document-level aggregation
    │  Aggregate per-section scores to document level
    ▼
Step 6: 3-Way score computation
    │  α × vector + β × graph + γ × fts5
    ▼
Step 7: Sort, filter, and build results
    │  doc_type filter, staleness annotation
    ▼
SearchOutput
```

## Step Details

### Step 1: Generate Query Embedding

Uses the `embedQuery()` method of EmbeddingProvider. For instruction-tuned models (e5 family), the search prefix `"query: "` is automatically prepended. Falls back to the standard `embed()` if `embedQuery` is not defined.

### Step 2: Vector Search

Executes a brute-force cosine similarity search against the VectorIndex. Since pre-normalized vectors use dot product for computation, no additional normalization is needed.

The candidate count is expanded to `limit × 10`, with re-ranking applied in subsequent graph and FTS5 scoring stages.

### Step 2.5: FTS5 Full-Text Search

Runs an FTS5 search with the same query to obtain keyword match signals.

FTS5 score normalization:
```
normalized_fts5_score = |rank| / max_rank    (0.0 to 1.0)
```

Since FTS5 rank values are negative (lower is better), the absolute value is taken and normalized by the maximum value. For multiple section hits within the same document, the highest score is used.

The trigram tokenizer also supports Japanese substring search.

### Step 3: Graph Traversal

Starting from the top `limit × 2` unique document IDs, `GraphTraversal` performs bidirectional BFS (Breadth-First Search) across the graph.

- **Maximum depth**: `config.search.max_depth` (default 2)
- **Traversal direction**: Both outlinks (references) and backlinks (reverse references)
- **link_types filter**: When specified in SearchInput, only links of the specified types are traversed

### Step 4: Compute Graph Proximity

```
graph_proximity(doc) = 1 / hop_distance
```

| Hops | Proximity |
|---|---|
| 0 (self / top vector hit) | 1.0 |
| 1 | 1.0 |
| 2 | 0.5 |
| 3 | 0.33 |

Top vector hits themselves receive a proximity of 1.0. When reachable from multiple starting points, the minimum hop count is used.

### Step 5: Document-Level Aggregation

Since vector search returns results at the section level, multiple sections from the same document are aggregated.

**Section aggregation logic**:
- Single section: Used directly as vector_similarity
- Multiple sections: `max × 0.8 + avg_top3 × 0.2`
  - Emphasizes the highest-scoring section while giving a bonus to documents with consistently relevant sections

Documents reached through graph traversal but not in vector results are also added as candidates (vector_similarity=0, graph_proximity only).

### Step 6: 3-Way Score Computation

```typescript
const hasFtsHits = ftsScoreMap.size > 0;
const gamma = hasFtsHits ? (1 - alpha) * 0.3 : 0;
const beta = (1 - alpha) - gamma;
const finalScore = alpha * vectorSimilarity + beta * graphProximity + gamma * ftsScore;
```

### Step 7: Build Results

1. Sort by finalScore in descending order
2. Apply `doc_type` filter (when specified)
3. Take the top `limit` results
4. For each document:
   - Attach match information for the top 3 sections
   - If no vector hit exists, attach the first section of the document (up to 500 characters)
   - Determine staleness level via `StalenessDetector`
   - Build score breakdown (vector_similarity, graph_proximity) and relevance_reason

## Fallback Strategy

### FTS5 Fallback

Falls back to FTS5 full-text search under the following conditions:

1. **Empty VectorIndex**: Embedding model not loaded or embeddings not generated
2. **Zero vector results**: No vector hits for the query
3. **Hybrid search failure**: When an error occurs

During fallback, the absolute value of the FTS5 rank is used as the score directly. The `search_type` is set to `"fulltext_fallback"`.

## SearchInput / SearchOutput

### Input Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `query` | string | (required) | Search query text |
| `limit` | number | 10 | Maximum number of results to return |
| `doc_type` | DocType | - | Document type filter |
| `include_linked` | boolean | - | Expand linked pages |
| `depth` | number | 2 | Graph traversal depth |
| `link_types` | LinkType[] | - | Link type filter |

### Output

```typescript
interface SearchOutput {
  results: SearchResult[];     // Search results array
  total_found: number;         // Total count after filtering
  search_type: 'hybrid' | 'fulltext_fallback';
}

interface SearchResult {
  doc_id: string;
  filepath: string;
  title: string;
  sections: SectionMatch[];    // Top 3 sections
  score: number;               // final_score
  score_breakdown: {
    vector_similarity: number;
    graph_proximity: number;
  };
  relevance_reason: string;    // Score breakdown string
  staleness: StalenessLevel;
  linked_pages?: LinkedPageSummary[];
}
```

## Performance Requirements

- Search response: within 200ms (at 1000-document scale)
- Candidate count limited to `limit × 10` to avoid unnecessary graph traversal
- Brute-force vector search uses pre-normalized dot product for fast computation
- Graph traversal limited by maximum BFS depth (default 2)
- See also non-functional requirements in [[architecture]]
