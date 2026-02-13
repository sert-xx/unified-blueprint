---
title: Async Pipeline Design
doc_type: design
source_refs:
  - src/core/watcher/file-watcher.ts
  - src/core/watcher/change-processor.ts
  - src/core/watcher/debouncer.ts
  - src/core/embedding/embedding-queue.ts
  - src/core/parser/markdown-parser.ts
  - src/core/parser/section-splitter.ts
---

[日本語](./async-pipeline.ja.md)

# Async Pipeline Design

Defines the async pipeline from file change detection through embedding generation.

## Overall Flow

```
File Change
    │
    ▼
FileWatcher (chokidar)
    │  add / change / unlink events
    ▼
Debouncer (500ms)
    │  Batched changes
    ▼
ChangeProcessor
    │
    ├── MarkdownParser (unified/remark)
    │     ├── FrontmatterParser (YAML)
    │     ├── SectionSplitter (H2/H3 boundaries)
    │     ├── WikiLinkExtractor ([[target|type]])
    │     └── MarkdownLinkExtractor ([text](./path.md))
    │
    ├── DocumentRepository.upsert()
    │     └── Change detection via body_hash comparison
    │
    ├── SectionRepository.replaceByDocId()
    │     └── Differential update via content_hash comparison
    │
    ├── LinkResolver.resolve()
    │     ├── File path matching
    │     └── Automatic dangling link resolution
    │
    ├── SourceRefsState.sync()
    │     └── SHA-256 hash update
    │
    └── EmbeddingQueue.enqueue()
          │  New/changed sections only
          ▼
    EmbeddingQueue (async batch processing)
          │  Batch size: 32
          ▼
    VectorIndex.upsert() + SectionRepository.updateEmbedding()
```

## File Watching

### FileWatcher

File system monitoring via chokidar.

- **Watch targets**: `*.md` files under `config.docs_dir`
- **Exclude patterns**: `config.source.exclude` (default: `node_modules`, `dist`, `.git`)
- **Events**: `add` (new), `change` (modified), `unlink` (deleted)
- **Path traversal prevention**: Paths pointing outside `docs_dir` are ignored

### Debouncer

Batches rapid successive changes.

- **Debounce interval**: 500ms
- Successive changes to the same file process only the last event
- Eliminates noise from temporary file writes during file saves

## Markdown Parsing

### MarkdownParser

Markdown analysis via the unified/remark pipeline.

Processing order:
1. Generate AST with `remark-parse`
2. Extract frontmatter with `remark-frontmatter`
3. Parse and validate YAML with `FrontmatterParser`
4. Split sections with `SectionSplitter`
5. Extract WikiLinks with `WikiLinkExtractor`
6. Extract standard Markdown links with `MarkdownLinkExtractor`
7. Merge WikiLinks and Markdown links with deduplication (WikiLinks take priority)

Return value: `ParseResult` (frontmatter, sections, links, title)

### Title Resolution

Title priority:
1. The `title` field in frontmatter
2. The first H1 heading in the body
3. The filename (without extension)

### FrontmatterParser

YAML frontmatter parsing and validation.

```yaml
---
title: Document Title
doc_type: design
source_refs:
  - src/core/engine.ts
  - src/shared/types.ts
---
```

- `doc_type`: Invalid values fall back to `other` with a warning
- `source_refs`: Path traversal check for each path (paths containing `..` are excluded with a warning)
- Undefined fields are ignored (no strict schema validation)

### SectionSplitter

Splits content into sections at H2/H3 headings.

**Splitting rules**:
1. H2/H3 are boundaries. H1 is the title, H4 and below are included in the parent section
2. Content before the first H2 -> `section_order=0`, `heading=null`
3. Each section's `section_order` is sequential starting from 0

**Dynamic size adjustment**:
- Over 256 tokens -> Dynamic sub-splitting at paragraph boundaries (blank lines)
- Under 32 tokens -> Merge with the previous section
- Token estimation: CJK characters x 1.5 + English words x 1.3

### WikiLinkExtractor

Operates as a remark plugin, extracting `[[target]]` and `[[target|type]]` patterns.

- WikiLinks inside code blocks are ignored
- Extracts 50 characters of context around each link
- Invalid link types fall back to `references` with a warning

### MarkdownLinkExtractor

Operates as a remark plugin, extracting links to internal `.md` files from standard Markdown links `[text](./path.md)`.

- External URLs (`http://`, `https://`, `mailto:`), anchor-only (`#section`), and non-`.md` files are ignored
- Anchor fragments and query strings are stripped to resolve the target path
- URL encoding (`%20`, etc.) is decoded
- Path traversal prevention (paths pointing outside docs_dir are skipped)
- Link type is always `references`
- When pointing to the same target as a WikiLink, the WikiLink takes priority and duplicates are removed

## Change Processing

### ChangeProcessor

A pipeline that transforms file changes into database updates.

#### processFile(filepath, content, options)

1. **Parse**: `MarkdownParser.parse(content)` -> ParseResult
2. **Document upsert**: body_hash comparison. Skipped if unchanged and `forceUpdate=false`
3. **Section replacement**: Differential update via `SectionRepository.replaceByDocId()`. Sections with matching content_hash retain their embeddings
4. **Link resolution**: Convert WikiLinks and Markdown links to file paths via `LinkResolver`. After resolution, deduplicate links with the same target + same type. Unresolved links are saved as dangling links
5. **Dangling link re-resolution**: When a new document is added, existing dangling links are re-resolved by title/basename
6. **source_refs sync**: Compute and store SHA-256 hashes of source files
7. **Embedding queue enqueue**: Add sections with no embedding or changed content to the queue

Return value: `{ docId, sectionsCreated, linksResolved, linksDangling, embeddingsQueued, skipped }`

#### processChange(FileChangeEvent)

- `add` / `change`: Read the file and call processFile
- `unlink`: Delete the document, sections, and links, and remove from VectorIndex

## Link Resolution

### LinkResolver

Resolves file paths from WikiLink and standard Markdown link target names.

**Matching strategy** (in priority order):
1. Full path match (`path/to/file.md`)
2. Basename match (considering presence/absence of `.md` extension)
3. Title match (search across all document titles)

**Dangling link re-resolution**: When a new document is added, unresolved links matching its title/basename are automatically resolved.

## Embedding Queue

### EmbeddingQueue

A job queue that asynchronously generates embeddings in the background.

- **Batch size**: 32 (`config.embedding.batch_size`)
- **Processing flow**: enqueue -> Generate batch -> Save to DB -> Update VectorIndex
- **Error handling**: On batch-level failure, falls back to individual retries
- **Event notifications**: `queue:progress` (progress), `queue:complete` (completion)

### Embedding Storage

1. `SectionRepository.updateEmbedding(id, buffer, model)` -- Persisted as BLOB
2. `VectorIndex.upsert(sectionId, docId, embedding)` -- Added to in-memory index

### Differential Embedding

Only sections with changed content_hash have their embeddings regenerated. For minor document edits (e.g., typo fixes), only the changed sections are reprocessed while other sections' embeddings are preserved.

## Memory Management

- Vector index is held in-memory as `Float32Array`. For 1000 documents, 3000 sections, and 1024 dimensions, approximately 12MB of memory usage
- SQLite mmap_size is limited to 256MB
- Embedding batch size of 32 controls memory consumption
- Lazy compaction (triggered at 20% empty entries) prevents index bloat
