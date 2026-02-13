[日本語](./README.ja.md)

# Design Documents

Technical design documents for UBP (Unified Blueprint). Each document covers a specific subsystem.

| Document | Description |
|----------|-------------|
| [System Architecture](./architecture.md) | Overall layered architecture (Interface / Core / Data / Embedding) and component responsibilities |
| [Database Schema](./database-schema.md) | SQLite schema design including documents, sections, links, source_refs, and FTS5 virtual tables |
| [Search Algorithm](./search-algorithm.md) | 3-way hybrid search combining vector similarity, graph proximity, and FTS5 full-text scoring |
| [Embedding Model](./embedding-model.md) | Local embedding with Xenova/multilingual-e5-large, token estimation, and batch processing |
| [MCP Tools](./mcp-tools.md) | MCP server tool specifications (ubp_search, ubp_get_page, ubp_get_context, etc.) |
| [CLI Commands](./cli-commands.md) | CLI command design (init, serve, search, status, stale, reindex, suggest-links, version) |
| [Async Pipeline](./async-pipeline.md) | Asynchronous embedding pipeline with queue-based processing and batch optimization |
| [Staleness Detection](./staleness-detection.md) | Document freshness tracking via source_refs hash comparison |

## Architecture Overview

```
Interface Layer     CLI (commander.js) / MCP Server (stdio)
        |
Core Layer          UbpEngine <- Parser, Search, Graph, Staleness, Watcher
        |
Data Layer          DatabaseManager, Repositories, VectorIndex, FTS5
        |
Embedding Layer     LocalEmbeddingProvider (ONNX Runtime)
```

See [System Architecture](./architecture.md) for details.
