# UBP CLI for AI Agents

This document describes how AI agents can use UBP via CLI commands instead of the MCP server.
Copy the relevant sections into your agent configuration (e.g., `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, or system prompts).

## When to use CLI instead of MCP

- MCP server integration is restricted by organizational policy
- The runtime environment does not support long-running MCP processes
- You need UBP access from shell-based agents or CI/CD pipelines

## Setup

Ensure `ubp` is installed and the project is initialized:

```bash
npm install -g ubp
ubp init --docs-dir docs
```

## Commands

All commands support `--json` for structured output. **Always use `--json` when calling from an agent.**

### Search documents

Semantic search combining vector similarity and graph proximity:

```bash
ubp search "authentication flow" --json
ubp search "authentication flow" --json --limit 10
ubp search "authentication flow" --json --include-links --depth 2
ubp search "authentication flow" --json --link-types references depends_on
```

Full-text keyword search (FTS5):

```bash
ubp search "AuthService" --fulltext --json
ubp search "AuthService" --fulltext --json --doc-type api
```

### Get a page

Retrieve full document content with sections, outlinks, backlinks, and staleness info:

```bash
ubp get-page "spec/architecture.md" --json
```

### Get context

Retrieve a page along with its related documents (outlinks and backlinks) in a single call:

```bash
ubp get-context "spec/architecture.md" --json
ubp get-context "spec/architecture.md" --json --depth 2
ubp get-context "spec/architecture.md" --json --depth 2 --max-size 102400
```

### List pages

List all documents with metadata:

```bash
ubp list-pages --json
ubp list-pages --json --doc-type spec
ubp list-pages --json --sort updated_at --order desc
```

### Get graph

Retrieve the document link graph as nodes and edges:

```bash
# Full graph
ubp get-graph --json

# Centered on a specific document
ubp get-graph --json --center "spec/architecture.md" --depth 3
```

### Other useful commands

```bash
ubp status --json          # Project status and statistics
ubp stale --json           # List stale documents
ubp suggest-links --json   # Suggest implicit link candidates
```

## MCP-to-CLI mapping

| MCP Tool | CLI Equivalent |
|---|---|
| `ubp_search` | `ubp search <query> --json [--include-links] [--depth N] [--link-types ...]` |
| `ubp_fulltext_search` | `ubp search <query> --fulltext --json [--doc-type TYPE]` |
| `ubp_get_page` | `ubp get-page <filepath> --json` |
| `ubp_get_context` | `ubp get-context <filepath> --json [--depth N] [--max-size N]` |
| `ubp_list_pages` | `ubp list-pages --json [--doc-type TYPE] [--sort FIELD] [--order asc\|desc]` |
| `ubp_get_graph` | `ubp get-graph --json [--center FILEPATH] [--depth N]` |

## Example: CLAUDE.md snippet

Add this to your project's `CLAUDE.md` to instruct Claude Code to use UBP via CLI:

````markdown
## Project documentation

This project uses UBP (Unified Blueprint) to manage documentation.
When you need to understand the project's design or specifications, use the `ubp` CLI commands before reading source code directly.

### How to query docs

```bash
# Search by concept or question
ubp search "your question here" --json

# Get a specific document
ubp get-page "spec/architecture.md" --json

# Get a document with all related context
ubp get-context "spec/architecture.md" --json --depth 2

# Browse available documents
ubp list-pages --json

# Understand document relationships
ubp get-graph --json --center "spec/architecture.md"

# Keyword search
ubp search "ClassName" --fulltext --json
```
````

## Parameter reference

### `ubp search`

| Option | Description | Default |
|---|---|---|
| `--limit <n>` | Number of results | 5 |
| `--include-links` | Include linked pages in results | false |
| `--depth <n>` | Link traversal depth (1-3) | 1 |
| `--link-types <types...>` | Filter: references, depends_on, implements, extends, conflicts_with | all |
| `--fulltext` | Use FTS5 full-text search | false |
| `--doc-type <type>` | Filter by type (fulltext mode only) | all |
| `--no-content` | Omit content from results | false |

### `ubp get-page`

| Option | Description | Default |
|---|---|---|
| `--no-content` | Omit full content | false |

### `ubp get-context`

| Option | Description | Default |
|---|---|---|
| `--depth <n>` | Hops of related pages (1-3) | 1 |
| `--max-size <bytes>` | Maximum response size | 51200 |
| `--no-content` | Omit content from related pages | false |

### `ubp list-pages`

| Option | Description | Default |
|---|---|---|
| `--doc-type <type>` | Filter: spec, design, adr, guide, api, meeting, todo, other | all |
| `--sort <field>` | Sort by: title, updated_at, filepath | title |
| `--order <order>` | Sort order: asc, desc | asc |

### `ubp get-graph`

| Option | Description | Default |
|---|---|---|
| `--center <filepath>` | Center on a specific document | full graph |
| `--depth <n>` | Traversal depth (1-5) | 2 |

### Global options

| Option | Description |
|---|---|
| `--json` | Output structured JSON (required for agent use) |
| `--cwd <path>` | Set working directory |
| `--quiet` | Suppress human-readable output |
| `--verbose` | Verbose output |
