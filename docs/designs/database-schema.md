---
title: Database Design
doc_type: design
source_refs:
  - src/data/migrations/001-initial-schema.ts
  - src/data/database-manager.ts
  - src/data/vector-index.ts
---

[日本語](./database-schema.ja.md)

# Database Design

Uses SQLite (better-sqlite3) as the data store. Combines vector search via an in-memory VectorIndex with full-text search via FTS5 virtual tables.

## Database Connection Settings

`DatabaseManager` configures the following PRAGMAs at initialization.

```sql
PRAGMA journal_mode = WAL;      -- Ensure read concurrency
PRAGMA synchronous = NORMAL;    -- Safe writes in WAL mode
PRAGMA cache_size = -64000;     -- 64MB cache
PRAGMA mmap_size = 268435456;   -- 256MB mmap
PRAGMA foreign_keys = ON;       -- Enable foreign key constraints
```

The database file is stored at `.ubp/knowledge.db`.

## ER Diagram

```
documents 1──N sections 1──0..1 embedding (BLOB)
    │                │
    │                └──N sections_fts (FTS5 virtual table)
    │
    ├──N links (source_doc_id)
    │      │
    │      └──0..1 links (target_doc_id) → documents
    │
    └──N source_refs_state
```

## Table Definitions

### documents

The primary table storing document metadata.

```sql
CREATE TABLE documents (
    id          TEXT    PRIMARY KEY,         -- UUID v4
    filepath    TEXT    NOT NULL UNIQUE,     -- Relative path from docs_dir
    title       TEXT    NOT NULL,            -- Document title
    doc_type    TEXT    NOT NULL DEFAULT 'spec'
                        CHECK(doc_type IN ('spec','design','db-schema','api','config','guide')),
    body_hash   TEXT    NOT NULL,            -- SHA-256 (for change detection)
    created_at  TEXT    NOT NULL,            -- ISO 8601
    updated_at  TEXT    NOT NULL             -- ISO 8601
);
```

Indexes:
- `idx_documents_filepath` -- For filepath lookups
- `idx_documents_title` -- For title searches
- `idx_documents_updated_at` -- For sorting by update time
- `idx_documents_doc_type` -- For document type filtering

`doc_type` stores 6 Data Layer-specific types (spec, design, db-schema, api, config, guide). These are converted to/from the Shared Layer's `DocType` (spec, design, adr, guide, api, meeting, todo, other) at the Interface Layer.

### sections

Sections split from each document at H2/H3 heading boundaries. These serve as the unit for embeddings and full-text search.

```sql
CREATE TABLE sections (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id          TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    heading         TEXT,                   -- Section heading (NULL = introductory portion)
    section_order   INTEGER NOT NULL,       -- Order within document (0-based)
    content         TEXT    NOT NULL,       -- Section body text
    content_hash    TEXT    NOT NULL,       -- SHA-256 (for differential updates)
    embedding       BLOB,                  -- Float32Array binary
    embedding_model TEXT,                  -- Model name used for generation
    token_count     INTEGER,               -- Estimated token count
    updated_at      TEXT    NOT NULL
);
```

Indexes:
- `idx_sections_doc_id` -- For per-document section lookups
- `idx_sections_heading` -- For heading searches (partial index excluding NULL)
- `idx_sections_embedding_model` -- For model migration
- `idx_sections_content_hash` -- For content change detection
- `idx_sections_doc_order` -- Unique constraint on (doc_id, section_order)

#### Section Splitting Rules

1. H2/H3 headings serve as section boundaries
2. Content before the first H2 is stored with `section_order=0`, `heading=NULL`
3. H1 is treated as the title and does not serve as a split boundary
4. H4 and below are included in the parent section
5. Sections exceeding 256 tokens are dynamically sub-split at paragraph boundaries
6. Sections under 32 tokens are merged with the previous section
7. Token estimation: CJK characters x 1.5 + English words x 1.3

### links

Stores inter-document relationships extracted from WikiLinks and standard Markdown links.

```sql
CREATE TABLE links (
    source_doc_id       TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    target_doc_id       TEXT    REFERENCES documents(id) ON DELETE CASCADE,  -- NULL = dangling link
    type                TEXT    NOT NULL DEFAULT 'references'
                                CHECK(type IN ('references','depends_on','implements','extends','conflicts_with')),
    context             TEXT,               -- 50 characters of context around the link
    source_section_id   INTEGER REFERENCES sections(id) ON DELETE SET NULL,
    target_title        TEXT,               -- Target name for unresolved links
    created_at          TEXT    NOT NULL
);
```

Indexes:
- `idx_links_pk` -- Unique constraint on (source_doc_id, COALESCE(target_doc_id, ''), type)
- `idx_links_target` -- For target-side lookups (partial index excluding NULL)
- `idx_links_type` -- For link type filtering
- `idx_links_source_section` -- For per-section link lookups
- `idx_links_dangling` -- For dangling link lookups (target_doc_id IS NULL)

#### Link Types

| Type | Notation | Meaning |
|---|---|---|
| `references` | `[[target]]` or `[text](./target.md)` | Reference (default) |
| `depends_on` | `[[target\|depends_on]]` | Dependency |
| `implements` | `[[target\|implements]]` | Implementation |
| `extends` | `[[target\|extends]]` | Extension |
| `conflicts_with` | `[[target\|conflicts_with]]` | Conflict |

Standard Markdown links are always imported as the `references` type. Use WikiLink notation when typed links are needed.

#### Dangling Links

Links with a NULL `target_doc_id` are dangling links (unresolved links). The `target_title` retains the target name from the WikiLink or Markdown link. When a new document is added, `LinkResolver` automatically resolves them via title, basename, and path matching.

### source_refs_state

A staleness tracking table for source code referenced by documents.

```sql
CREATE TABLE source_refs_state (
    doc_id              TEXT    NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    file_path           TEXT    NOT NULL,       -- Source file path
    last_synced_hash    TEXT,                   -- SHA-256 at last sync
    last_synced_at      TEXT,                   -- Last sync timestamp
    is_stale            INTEGER NOT NULL DEFAULT 0
                                CHECK(is_stale IN (0, 1)),
    PRIMARY KEY (doc_id, file_path)
);
```

Indexes:
- `idx_source_refs_stale` -- For stale record lookups (partial index on is_stale=1)

See [[staleness-detection|depends_on]] for details.

## FTS5 Full-text Search

### Virtual Table

```sql
CREATE VIRTUAL TABLE sections_fts USING fts5(
    heading,
    content,
    content='sections',
    content_rowid='id',
    tokenize='trigram'
);
```

Uses the **trigram tokenizer**. By splitting into 3-character N-grams, substring search for Japanese (CJK characters) becomes possible. With the unicode61 tokenizer, entire Japanese text was treated as a single token making search impossible, but trigram enables correct keyword search for terms like Japanese words.

### Sync Triggers

Defines triggers to automatically sync the FTS5 index on insert, update, and delete of the sections table.

```sql
-- INSERT: When a new section is added
CREATE TRIGGER sections_fts_insert AFTER INSERT ON sections BEGIN
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

-- UPDATE: When heading or content changes
CREATE TRIGGER sections_fts_update AFTER UPDATE OF heading, content ON sections BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
    INSERT INTO sections_fts(rowid, heading, content)
    VALUES (NEW.id, NEW.heading, NEW.content);
END;

-- DELETE: When a section is deleted
CREATE TRIGGER sections_fts_delete AFTER DELETE ON sections BEGIN
    INSERT INTO sections_fts(sections_fts, rowid, heading, content)
    VALUES ('delete', OLD.id, OLD.heading, OLD.content);
END;
```

### FTS5 Query Sanitization

`FulltextSearchService` performs token-based sanitization to prevent FTS5 injection. Each token is wrapped in double quotes with internal quotes escaped. FTS5 operators such as AND/OR/NOT/NEAR are also neutralized.

## In-memory Vector Index

`VectorIndex` loads embeddings persisted in the SQLite sections table into memory at application startup and performs brute-force cosine similarity search.

### Key Specifications

- **Automatic dimension detection**: Dimensions are automatically determined on the first upsert or loadFromDatabase (default 0)
- **Pre-normalized vectors**: Since EmbeddingProvider returns pre-normalized vectors, dot product = cosine similarity
- **Lazy compaction**: Compaction is executed when deleted entries exceed 20% of the total
- **Persistence**: Embeddings are stored as `Buffer` in the BLOB column of the sections table

### Operations

| Method | Description |
|---|---|
| `loadFromDatabase(db)` | Bulk load embeddings at DB startup |
| `upsert(sectionId, docId, embedding)` | Add or update a vector |
| `removeByDocId(docId)` | Bulk delete vectors when a document is deleted |
| `search(queryEmbedding, topK)` | Top-K search by cosine similarity |

## Repository Layer

`DatabaseManager` manages the following repositories and services via lazy initialization.

### DocumentRepository

- `findById(id)` / `findByFilepath(filepath)` / `findByTitle(title)` / `findAll(options?)`
- `upsert(doc)` -- Change detection via body_hash comparison. Skipped if unchanged
- `deleteById(id)` / `deleteNotIn(filepaths)` -- Cleanup of deleted files

### SectionRepository

- `findByDocId(docId)` / `findById(id)` / `count()` / `countWithEmbedding()`
- `findPendingEmbeddings()` -- Retrieve sections where embedding IS NULL
- `findByEmbeddingModelNot(model)` -- For model migration
- `replaceByDocId(docId, sections)` -- Differential update via content_hash comparison
- `updateEmbedding(id, buffer, model)` -- Update after embedding generation

### LinkRepository

- `findBySourceDocId(docId)` / `findByTargetDocId(docId)` / `count()`
- `replaceBySourceDocId(docId, links)` -- Full replacement of a document's links
- `findDangling()` / `resolveDangling(targetTitle, targetDocId)` -- Dangling link management

### SourceRefsStateRepository

- `findByDocId(docId)` / `findStale()`
- `syncByDocId(docId, refs)` -- Update source_refs hashes
- `updateStaleness(docId, filePath, isStale)` -- Update staleness flag
- `summary()` -- Aggregate fresh/stale/total counts

### GraphQueryService

- `traverseBidirectional(docId, depth)` -- N-hop graph traversal via recursive CTE
- `getGraphStructure(centerDocId?, depth)` -- Retrieve graph node and edge structure

### FulltextSearchService

- `search(query, limit)` -- Execute FTS5 query. Returns highlighted snippets of 64 characters via the snippet() function

## Migration Strategy

Schema changes are managed via numbered migration files in `src/data/migrations/`. The `schema_version` table tracks applied versions, and unapplied migrations are applied sequentially at startup.

Current version: **v1** (initial schema)

## StatementCache

`StatementCache` caches prepared statements by key, reducing prepare overhead for repeated queries. All caches are cleared when `DatabaseManager` is closed.
