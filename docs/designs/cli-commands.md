---
title: CLI Command Design
doc_type: guide
source_refs:
  - src/interface/cli/index.ts
  - src/interface/cli/commands/init.ts
  - src/interface/cli/commands/serve.ts
  - src/interface/cli/commands/search.ts
  - src/interface/cli/commands/status.ts
  - src/interface/cli/commands/reindex.ts
  - src/interface/cli/commands/stale.ts
  - src/interface/cli/commands/suggest-links.ts
---

[日本語](./cli-commands.ja.md)

# CLI Command Design

Design of the command-line interface provided by Unified Blueprint. Uses Commander.js and offers 8 commands.

## Global Options

Options common to all commands:

| Option | Short | Description |
|---|---|---|
| `--cwd <path>` | - | Specify project root (default: current directory) |
| `--log-level <level>` | - | Log level: debug / info / warn / error |

## ubp init

Initializes the project. Scans the document directory, parses all files, and builds the index.

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--docs-dir <path>` | `-d` | `docs` | Document directory |
| `--include <patterns>` | `-i` | `**/*.md` | Target file patterns (comma-separated) |
| `--exclude <patterns>` | `-e` | `node_modules,dist,.git` | Exclusion patterns (comma-separated) |
| `--skip-embedding` | - | false | Skip embedding generation |

### Processing Flow

1. Create `.ubp/` directory and `config.json`
2. Initialize SQLite database (apply migrations)
3. Download embedding model (first time only, skipped with `--skip-embedding`)
4. Scan document directory and process all `.md` files
5. Parse -> section splitting -> link resolution -> save to DB
6. Start embedding generation on background queue
7. Display result summary

### Onboarding

On first run, displays an MCP server configuration snippet and guides the user on how to integrate with Claude Desktop or Cursor.

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["ubp", "serve"],
      "cwd": "/path/to/project"
    }
  }
}
```

## ubp serve

Starts the MCP server via stdio. Simultaneously begins file watching and reflects document changes in the index in real time.

### Options

| Option | Short | Description |
|---|---|---|
| `--skip-embedding` | - | Skip embedding generation (operates with FTS5 fallback) |

### Behavior

- Provides MCP protocol via stdio transport
- Prevents multiple instances with process lock (`.ubp/serve.lock`)
- If an existing process is detected, displays the PID and exits with an error
- Graceful shutdown on SIGINT/SIGTERM (releases lock, disconnects DB)
- Automatic change detection via file watching (500ms debounce)
- If embedding provider initialization fails, continues operation with FTS5 fallback

## ubp search

Executes document search.

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--limit <n>` | `-l` | 10 | Maximum number of results |
| `--fulltext` | `-f` | false | Switch to FTS5 full-text search |
| `--doc-type <type>` | `-t` | - | Document type filter |
| `--json` | - | false | Output in JSON format |

### Examples

```bash
# Hybrid search
ubp search "dependencies between documents"

# FTS5 full-text search
ubp search --fulltext "WikiLink"

# JSON output
ubp search --json --limit 5 "search algorithm"
```

See [[search-algorithm]] for details on the search algorithm.

## ubp status

Displays project status.

### Options

| Option | Description |
|---|---|
| `--json` | Output in JSON format |

### Output

```typescript
{
  initialized: boolean,
  docs_dir: string,
  total_documents: number,
  total_sections: number,
  total_links: number,
  resolved_links: number,
  unresolved_links: number,
  embedding_progress: {
    completed: number,
    total: number,
    model: string
  },
  stale_documents: number,
  db_size_bytes: number
}
```

The default table-format output displays the above information in a human-readable format.

## ubp reindex

Rebuilds the index.

### Options

| Option | Short | Description |
|---|---|---|
| `--force` | `-f` | Reprocess all files even if unchanged |
| `--file <path>` | - | Reindex only the specified file |
| `--skip-embedding` | - | Skip embedding regeneration |

### Incremental Updates

By default, changes are detected using `body_hash` and `content_hash`, and only modified documents and sections are reprocessed. Embeddings are regenerated only for sections whose `content_hash` has changed.

With `--force`, all files are forcefully reprocessed. Use this for full embedding regeneration after a model change.

Documents that no longer exist on disk are automatically deleted from the database.

## ubp stale

Lists stale documents. Based on the source_refs mechanism of [[staleness-detection]].

### Options

| Option | Description |
|---|---|
| `--json` | Output in JSON format |
| `--exit-code` | Exit with code 1 if stale documents exist |

### Output

For each stale document, the following information is displayed:
- File path
- Title
- Staleness level (stale / untracked)
- List of source_refs causing staleness and their reasons (modified / deleted / not_found)

### CI Usage Example

```bash
# Integrate into pull request checks
ubp stale --exit-code || echo "Stale documents found!"
```

## ubp suggest-links

Generates link suggestions between documents based on vector similarity. Detects document pairs that are semantically related but lack WikiLinks.

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--threshold <n>` | `-t` | 0.5 | Similarity threshold (0.0-1.0) |
| `--limit <n>` | `-l` | 20 | Maximum number of suggestions |
| `--json` | - | false | Output in JSON format |

### Output

```typescript
{
  suggestions: [{
    source_filepath: string,
    target_filepath: string,
    similarity: number,
    source_section: string,    // heading of the related section
    target_section: string
  }],
  total: number
}
```

## ubp version

Displays UBP version information. References the version field in `package.json`.

## CLI Output Format

### Table Output

The default CLI output uses picocolors for colored table formatting. Visually displays search result scores, staleness levels, etc.

### JSON Output

When the `--json` option is specified, all commands output in JSON format. Supports pipeline processing and scripting use cases.

### Progress Display

File processing and embedding generation progress are shown with spinners and progress bars.

### Error Display

Error messages are displayed in red, with resolution hints provided when possible. Stack traces are shown only when `--log-level debug` is specified.
