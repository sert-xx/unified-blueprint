# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-02-09

### Added

- Document Graph with WikiLink (`[[target]]`) and Markdown link support
- 3-way hybrid search combining vector similarity, graph traversal, and FTS5 full-text search
- Local embedding with Xenova/multilingual-e5-large (bilingual Japanese/English)
- MCP server with 6 tools for AI agent integration
- CLI with 8 commands (init, serve, search, status, stale, reindex, suggest-links, version)
- Real-time file watching with incremental updates
- Staleness detection via source_refs hash comparison
- SQLite-based persistent storage
