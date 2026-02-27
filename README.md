[日本語](./README.ja.md)

# UBP - Unified Blueprint

[![npm version](https://img.shields.io/npm/v/ubp.svg)](https://www.npmjs.com/package/ubp)
[![CI](https://github.com/sert-xx/unified-blueprint/actions/workflows/ci.yml/badge.svg)](https://github.com/sert-xx/unified-blueprint/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

> Documentation-as-Code middleware that structures Markdown documents into a Document Graph, providing semantic search, graph traversal, and full-text search for AI agents.

UBP parses your Markdown documentation, builds a graph of inter-document relationships, generates local embeddings, and exposes a hybrid search API via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). AI coding assistants like Claude Code and Claude Desktop can query your docs directly through the MCP interface.

## Features

- **3-Way Hybrid Search** -- Vector similarity + graph proximity + FTS5 full-text search with unified scoring
- **Document Graph** -- Manage inter-document links via WikiLinks (`[[target]]`) and standard Markdown links (`[text](./path.md)`)
- **Local Embeddings** -- Bilingual (English/Japanese) support via Xenova/multilingual-e5-large with no external API required
- **MCP Server** -- Directly usable from Claude Code, Claude Desktop, and Cursor
- **Real-Time Sync** -- File watcher with incremental updates
- **Staleness Detection** -- Check document-to-source-code consistency via `source_refs`

## Prerequisites

- Node.js >= 18.0.0
- C++ compiler toolchain (required by `better-sqlite3` native addon)
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** `build-essential` (`apt install build-essential`)
  - **Windows:** Visual Studio Build Tools or `npm install -g windows-build-tools`

## Installation

```bash
npm install -g ubp
```

## Quick Start

### 1. Initialize your project

```bash
ubp init --docs-dir docs
```

This parses Markdown files under `docs/`, splits them into sections, resolves links, generates embeddings, and stores everything in `.ubp/ubp.db`.

### 2. Search

```bash
# Semantic search (hybrid)
ubp search "how the search algorithm works"

# Full-text search (FTS5)
ubp search "trigram" --fulltext
```

### 3. Start the MCP server

```bash
ubp serve --no-lock
```

## MCP Integration

Configuration snippets are displayed when you run `ubp init`.

**Claude Code:**

```bash
claude mcp add ubp -- node dist/main.js serve --no-lock
```

**Claude Desktop** (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["-y", "ubp", "serve", "--no-lock"],
      "cwd": "/path/to/project"
    }
  }
}
```

## MCP Tools

| Tool | Description |
|---|---|
| `ubp_search` | Semantic search (3-way hybrid) |
| `ubp_get_page` | Retrieve full document content |
| `ubp_get_context` | Retrieve a document with its related documents |
| `ubp_fulltext_search` | Keyword full-text search (FTS5) |
| `ubp_list_pages` | List all documents |
| `ubp_get_graph` | Document link graph |

## CLI Commands

| Command | Description |
|---|---|
| `ubp init` | Initialize project (parse and generate embeddings) |
| `ubp serve` | Start file watcher + MCP server |
| `ubp search <query>` | Hybrid search / full-text search |
| `ubp get-page <filepath>` | Retrieve full document content with links |
| `ubp get-context <filepath>` | Retrieve a document with its related documents |
| `ubp list-pages` | List all documents |
| `ubp get-graph` | Document link graph |
| `ubp status` | Show database statistics |
| `ubp stale` | Detect stale documents |
| `ubp reindex` | Reindex all documents |
| `ubp suggest-links` | Suggest link candidates |
| `ubp version` | Show version |

Global options: `--cwd <path>`, `--json`, `--verbose`, `--quiet`

### Using CLI as an alternative to MCP

When MCP server integration is not available, AI agents can use the CLI with `--json` flag to get structured output equivalent to MCP tools. See [AGENTS.md](./AGENTS.md) for detailed instructions.

## Markdown Notation

### Frontmatter

```yaml
---
title: Document Title
tags: [design, architecture]
source_refs:
  - src/core/engine.ts
  - src/data/database-manager.ts
---
```

### WikiLinks

```markdown
See [[architecture]] for details.
Link to a specific section: [[database-schema#FTS5-config]]
With alias: [[search-algorithm|How search works]]
```

### Standard Markdown Links

Standard Markdown links are automatically captured as `references`-type links. There is no need to manually add WikiLinks -- existing Markdown links are reflected in the Document Graph as-is.

```markdown
See [Architecture Design](./designs/architecture.md) for details.
```

- Only relative links to internal `.md` files are captured (external URLs, anchor-only links, and non-`.md` files are ignored)
- When both a WikiLink and a Markdown link point to the same target, the WikiLink takes precedence and duplicates are removed

## Configuration

Customize settings in `.ubp/config.json`:

```json
{
  "docs_dir": "docs",
  "source": {
    "include": ["**/*.md"],
    "exclude": []
  },
  "embedding": {
    "model": "Xenova/multilingual-e5-large",
    "dimensions": 1024,
    "batch_size": 32
  },
  "search": {
    "alpha": 0.7,
    "default_limit": 10,
    "max_depth": 2
  },
  "staleness": {
    "threshold_days": 7
  }
}
```

`search.alpha` controls the score weight distribution:

```
score = alpha * vector + beta * graph + gamma * fts5
beta = (1 - alpha) * 0.67,  gamma = (1 - alpha) * 0.33
```

## Architecture

```
Interface Layer     CLI (commander.js) / MCP Server (stdio)
        |
Core Layer          UbpEngine <- Parser, Search, Graph, Staleness, Watcher
        |
Data Layer          DatabaseManager, Repositories, VectorIndex, FTS5
        |
Embedding Layer     LocalEmbeddingProvider (ONNX Runtime)
```

## Development

```bash
git clone https://github.com/sert-xx/unified-blueprint.git
cd unified-blueprint
npm install
npm test              # Run tests
npm run test:watch    # Watch mode
npm run typecheck     # Type checking
npm run build         # Build
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

[MIT](./LICENSE)
