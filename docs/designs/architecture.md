---
title: System Architecture Design
doc_type: design
source_refs:
  - src/core/engine.ts
  - src/main.ts
---

[日本語](./architecture.ja.md)

# System Architecture Design

Unified Blueprint (UBP) is a Documentation-as-Code middleware that structures Git-managed Markdown documents as a Document Graph, enabling semantic search and graph traversal from AI agents.

## Design Principles

- **Local-first**: No external API dependencies. Embedding models run locally (transformers.js / ONNX Runtime)
- **Zero-config startup**: Setup completes with a single `ubp init` command. Works practically with default settings
- **Documentation-as-Code**: Documents are managed in Git, with WikiLinks and standard Markdown links making inter-document relationships explicit
- **MCP integration**: Direct integration with AI agents such as Claude Desktop and Cursor via Model Context Protocol

## Layer Structure

The system consists of four layers. Each layer has unidirectional dependencies only, with upper layers depending on lower layers.

```
┌──────────────────────────────────────────────────┐
│  Interface Layer (CLI + MCP Server)              │
│    src/interface/cli/    src/interface/mcp/       │
├──────────────────────────────────────────────────┤
│  Core Layer (Engine Facade + Domain Logic)       │
│    src/core/engine.ts                            │
│    src/core/parser/   search/   graph/           │
│    src/core/watcher/  linker/   staleness/       │
│    src/core/embedding/  suggest/                 │
├──────────────────────────────────────────────────┤
│  Data Layer (SQLite + Vector Index)              │
│    src/data/database-manager.ts                  │
│    src/data/repositories/   services/            │
│    src/data/vector-index.ts                      │
├──────────────────────────────────────────────────┤
│  Embedding Layer (Provider Abstraction)          │
│    src/embedding/provider.ts                     │
│    src/embedding/local-provider.ts               │
│    src/embedding/model-manager.ts                │
└──────────────────────────────────────────────────┘
```

### Source Layer (Input)

Git-managed Markdown files. Metadata such as `doc_type` and `source_refs` is described in frontmatter, while inter-document relationships are expressed through WikiLinks (`[[target|link_type]]`) and standard Markdown links (`[text](./path.md)`) in the body.

### Core Layer

The layer responsible for domain logic. `UbpEngine` (`src/core/engine.ts`) serves as the facade that integrates all functionality. The Interface Layer accesses the Core Layer exclusively through `UbpEngine`.

| Module | Directory | Responsibility |
|---|---|---|
| Parser | `src/core/parser/` | Markdown parsing, frontmatter analysis, section splitting, WikiLink and Markdown link extraction |
| Linker | `src/core/linker/` | File path resolution for WikiLinks and Markdown links, dangling link re-resolution |
| Search | `src/core/search/` | Hybrid search (vector + graph + FTS5), fallback |
| Graph | `src/core/graph/` | N-hop graph traversal, proximity scoring |
| Watcher | `src/core/watcher/` | File change monitoring, debounce processing, change pipeline |
| Staleness | `src/core/staleness/` | Staleness detection via source_refs hash comparison |
| Embedding | `src/core/embedding/` | Embedding job queue, batch processing |
| Suggest | `src/core/suggest/` | Link suggestions based on vector similarity |

### Data Layer

Provides data persistence via SQLite (better-sqlite3) and vector search via an in-memory VectorIndex. `DatabaseManager` manages all repositories and services in a unified manner.

See [[database-schema|depends_on]] for details.

### Embedding Layer

Abstracts model implementations through the EmbeddingProvider interface. The default `LocalEmbeddingProvider` runs locally using transformers.js (ONNX Runtime).

See [[embedding-model|depends_on]] for details.

### Interface Layer

#### CLI (Commander.js)

Provides 8 commands: init, serve, search, status, reindex, stale, suggest-links, version. See [[cli-commands|depends_on]] for details.

#### MCP Server

Exposes 6 tools via stdio using `@modelcontextprotocol/sdk`. See [[mcp-tools|depends_on]] for details.

## UbpEngine Facade

`UbpEngine` is the public API of the Core Layer and the sole point of contact with the Interface Layer.

### Lifecycle

1. **initialize()**: Initialize a new project. Save config -> Create DB -> Initialize embedding provider -> Scan files -> Parse -> Build index -> Start embedding queue
2. **loadExisting()**: Load an existing project. Load config -> Connect DB -> Initialize embedding provider -> Initialize core modules
3. **close()**: Release resources. Stop file watcher -> Stop embedding queue -> Release provider -> Disconnect DB -> Terminate logger

### Primary Operations

| Method | Description |
|---|---|
| `search(SearchInput)` | Hybrid semantic search |
| `fulltextSearch(FulltextSearchInput)` | FTS5 full-text search |
| `getPage(GetPageInput)` | Retrieve a single page (including links and staleness) |
| `getContext(GetContextInput)` | Retrieve a page with graph neighbors |
| `listPages(ListPagesInput)` | List all pages |
| `getGraph(GetGraphInput)` | Retrieve graph structure |
| `getStatus()` | Project statistics |
| `getStaleDocuments()` | List stale documents |
| `suggestLinks()` | Generate link suggestions |
| `startWatching()` / `stopWatching()` | Control file watching |
| `reindex(ReindexOptions)` | Rebuild index |

## Error Handling

Errors are managed through hierarchical custom errors derived from the `UbpError` base class.

```
UbpError (base)
├── ConfigError / ConfigNotFoundError
├── DatabaseError / MigrationError
├── ParseError
├── LinkResolutionError
├── EmbeddingError / EmbeddingModelNotAvailableError
├── DocumentNotFoundError
└── IndexNotReadyError
```

- User-facing errors (CLI output, MCP responses) do not include stack traces
- Errors via MCP are returned in JSON-RPC format with error codes and messages
- When embedding provider initialization fails, operation continues with FTS5 fallback

## Configuration Management

Configuration is stored in `.ubp/config.json`. It is defined by the `UbpConfig` type, with `DEFAULT_CONFIG` providing default values.

```
.ubp/
├── config.json      # Project configuration
├── knowledge.db     # SQLite database
├── knowledge.db-wal # WAL file
└── serve.lock       # Process lock
```

Configuration details are as follows:

| Key | Default | Description |
|---|---|---|
| `docs_dir` | `"docs"` | Document directory |
| `source.include` | `["**/*.md"]` | Target file patterns |
| `source.exclude` | `["**/node_modules/**", ...]` | Exclude patterns |
| `embedding.model` | `"Xenova/multilingual-e5-large"` | Embedding model name |
| `embedding.dimensions` | `1024` | Vector dimensions |
| `embedding.batch_size` | `32` | Batch size |
| `search.alpha` | `0.7` | Vector weight (hybrid search) |
| `search.default_limit` | `10` | Default search result count |
| `search.max_depth` | `2` | Maximum graph traversal depth |
| `staleness.threshold_days` | `7` | Staleness threshold in days |
| `log.level` | `"info"` | Log level |

## Deployment

- Runs as a local process with no external service dependencies
- Distributed as an npm package (start immediately with `npx ubp init`)
- Requires Node.js 18 or higher
- Embedding models are automatically downloaded on first run and cached in `~/.cache/ubp/models/`
- Process lock (`serve.lock`) prevents multiple MCP server instances from starting

## Non-functional Requirements

- Search response: Within 200ms (at 1000-document scale)
- Initialization: Scales linearly with file count
- Memory: Vector index held in-memory as Float32Array, SQLite mmap up to 256MB
- Database: WAL mode, synchronous=NORMAL, cache_size=64MB
