---
title: Staleness Detection Design
doc_type: design
source_refs:
  - src/core/staleness/staleness-detector.ts
  - src/data/repositories/source-refs-repository.ts
---

[日本語](./staleness-detection.ja.md)

# Staleness Detection Design

Defines the mechanism for detecting changes in source code referenced by documents and identifying documents that need updating.

## Overview

In Documentation-as-Code, design documents often reference implementation code. When source code changes, related documents may also need updating. UBP automatically detects this staleness through the `source_refs` field in frontmatter and SHA-256 hash comparison.

## source_refs Mechanism

### Frontmatter Definition

List the referenced source file paths in the `source_refs` field of the document's frontmatter. Paths are specified as relative paths from the project root.

```yaml
---
title: Search Algorithm Design
doc_type: spec
source_refs:
  - src/core/search/hybrid-search.ts
  - src/core/search/vector-search.ts
  - src/core/graph/graph-traversal.ts
---
```

### Hash Tracking

For each source_ref, the SHA-256 hash of the source file is stored in the `source_refs_state` table.

```
source_refs_state:
  doc_id          → Document ID
  file_path       → Source file path
  last_synced_hash → SHA-256 hash at last sync
  last_synced_at  → Last sync timestamp
  is_stale        → Staleness flag (0/1)
```

During document indexing (init, reindex, or file change), the SHA-256 of each source_ref is computed and stored in `last_synced_hash`.

## Staleness Levels

Four staleness levels are defined.

### fresh

All source_refs hashes match `last_synced_hash`. The document is up to date and does not need updating.

### possibly_stale

Documents where `source_refs` is defined but at least one referenced file has a hash mismatch within the staleness threshold period. The document may need updating but is not yet confirmed stale.

### stale

At least one source_ref hash differs from `last_synced_hash`. The referenced source code has changed and the document needs updating.

### untracked

The `source_refs` field is defined but the referenced files do not exist (no `last_synced_hash` recorded). This may be caused by file moves, deletions, or incorrect paths.

## Detection Flow

### During Document Indexing

When `ChangeProcessor` processes a document, `StalenessDetector` computes and stores the hash for each source_ref.

```
1. Extract source_refs from frontmatter
2. Validate each path against path traversal
3. If file exists, compute SHA-256
4. Upsert into source_refs_state (last_synced_hash, last_synced_at)
```

### During Staleness Check

Executed via the `ubp stale` command or when retrieving pages through MCP tools.

```
1. Retrieve all records from source_refs_state
2. Compute current SHA-256 for each file_path
3. Compare with last_synced_hash
4. Mismatch → is_stale = 1, reason = 'modified'
5. File missing → reason = 'not_found'
6. Match → is_stale = 0
```

### During Page Retrieval via MCP

When retrieving a document via `ubp_get_page`, the current staleness level is included in the `staleness` field, and a list of stale source file paths is included in `stale_refs`. AI agents can use this information to suggest document updates.

## Path Traversal Prevention

source_refs paths are restricted to within the project root.

### During Frontmatter Parsing

`FrontmatterParser` validates each path in `source_refs` and excludes paths containing `..` with a warning.

```
source_refs:
  - src/valid/path.ts          → OK
  - ../outside/project.ts      → Warning and excluded
  - src/../../escape/path.ts   → Warning and excluded
```

### Runtime Validation

`StalenessDetector` normalizes paths before hash computation and rejects paths that point outside the project root. After converting to absolute paths with `path.resolve()`, it verifies the path is under the project root.

## CI Integration

### --exit-code Option

Running `ubp stale --exit-code` exits with code 1 when stale documents exist. By incorporating this into a CI pipeline, document staleness can be detected at the pull request stage.

```bash
# CI configuration example
ubp stale --exit-code
# exit 0: All documents are fresh
# exit 1: Stale documents exist
```

### --json Option

`ubp stale --json` provides machine-readable JSON output for integration with CI tools and report generation.

## StaleDocInfo

Stale document information is returned in the following structure:

```typescript
interface StaleDocInfo {
  doc_id: string;
  filepath: string;
  title: string;
  staleness: StalenessLevel;
  stale_refs: StaleRefInfo[];
}

interface StaleRefInfo {
  source_path: string;
  reason: 'modified' | 'deleted' | 'not_found';
}
```

Meaning of `reason`:
- `modified`: The source file hash has changed
- `deleted`: The source file has been deleted
- `not_found`: The source file cannot be found (e.g., incorrect path)
