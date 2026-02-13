---
title: MCP Tool Specification
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

[日本語](./mcp-tools.ja.md)

# MCP Tool Specification

Defines the tools exposed via Model Context Protocol (MCP). Uses `@modelcontextprotocol/sdk` and integrates with AI agents (Claude Desktop, Cursor, etc.) via stdio.

## MCP Server Configuration

The MCP server is started with the `ubp serve` command. It uses stdio transport and prevents multiple instances with a process lock (`.ubp/serve.lock`). File watching starts simultaneously, reflecting document changes in the index in real time.

Error responses are returned in JSON-RPC format without stack traces. MCP error codes:
- `-32602`: Invalid parameters
- `-32603`: Internal error

## Tool List

### ubp_search

Executes a Graph-Aware semantic search. Returns optimal results using 3-way hybrid scoring that combines vector similarity, graph proximity, and FTS5 scores.

**Parameters**:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | - | Search query text |
| `limit` | number | No | 10 | Maximum number of results (1-20) |
| `include_linked` | boolean | No | false | Expand linked pages |
| `depth` | number | No | 2 | Graph traversal depth (1-3) |
| `link_types` | string[] | No | - | Link type filter |

**Response**: `SearchOutput`

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

Implementation is based on [[search-algorithm]].

### ubp_get_page

Retrieves a document at the specified file path. Returns complete information including all section contents, outlinks, backlinks, and staleness status.

**Parameters**:

| Name | Type | Required | Description |
|---|---|---|---|
| `filepath` | string | Yes | Document file path (relative to docs_dir) |

**Response**: `GetPageOutput`

```typescript
{
  doc_id: string,
  filepath: string,
  title: string,
  doc_type: DocType,
  content: string,               // concatenated text of all sections
  sections: [{ heading, content }],
  outlinks: [{ doc_id, filepath, title, link_type }],
  backlinks: [{ doc_id, filepath, title, link_type }],
  staleness: StalenessLevel,
  stale_refs: string[],          // source file paths that are stale
  updated_at: string
}
```

### ubp_get_context

Retrieves a document along with its graph neighborhood. Designed for AI agents to efficiently retrieve the information needed for their context window.

**Parameters**:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `filepath` | string | Yes | - | File path of the center document |
| `depth` | number | No | 2 | Graph traversal depth (1-3) |
| `max_size` | number | No | 50000 | Maximum output character count |

**Response**: `GetContextOutput`

```typescript
{
  center: {
    doc_id: string,
    filepath: string,
    title: string,
    content: string                // concatenated text of all sections
  },
  related: [{
    doc_id: string,
    filepath: string,
    title: string,
    link_type: LinkType,
    direction: 'outlink' | 'backlink',
    summary: string,               // first 500 characters
    depth: number
  }],
  total_size: number,
  truncated_count: number          // number of documents omitted due to max_size
}
```

When `max_size` is exceeded, related documents are omitted and `truncated_count` indicates the count.

### ubp_fulltext_search

Full-text keyword search using FTS5. Supports Japanese substring search via the trigram tokenizer. Also functions as a fallback when embeddings are unavailable.

**Parameters**:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | Yes | - | Search keyword |
| `limit` | number | No | 10 | Maximum number of results (1-50) |
| `doc_type` | string | No | - | Document type filter |

**Response**: `FulltextSearchOutput`

```typescript
{
  results: [{
    doc_id: string,
    filepath: string,
    title: string,
    section_heading: string | null,
    snippet: string,               // 64-character highlighted snippet
    rank: number
  }],
  total_found: number
}
```

### ubp_list_pages

Lists all indexed documents. Supports filtering by document type and sorting by title, updated_at, or filepath.

**Parameters**:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `doc_type` | string | No | - | Document type filter |
| `sort` | string | No | `"title"` | Sort key: title / updated_at / filepath |
| `order` | string | No | `"asc"` | Sort order: asc / desc |

**Response**: `ListPagesOutput`

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

Returns the document graph structure (nodes and edges). Can retrieve the full graph or a subgraph centered on a specific document.

**Parameters**:

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `center` | string | No | - | Center document (filepath or doc_id) |
| `depth` | number | No | 2 | Graph traversal depth (1-5) |

**Response**: `GetGraphOutput`

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
    type: LinkType               // link type
  }]
}
```

When `center` is not specified, returns the graph of all documents. Built from the links table in [[database-schema]].

## Usage Patterns for AI Agents

### Context Gathering

```
1. ubp_search("search query") -> identify relevant documents
2. ubp_get_context(filepath, depth=2) -> retrieve center + related documents
3. Feed into context window and generate response
```

### Document Exploration

```
1. ubp_list_pages(doc_type="design") -> list design documents
2. ubp_get_page(filepath) -> view details
3. ubp_get_graph(center=filepath) -> check dependencies
```

### Freshness Check

```
1. ubp_get_page(filepath) -> check staleness + stale_refs
2. Review changes in source files causing staleness
3. Suggest document updates
```
