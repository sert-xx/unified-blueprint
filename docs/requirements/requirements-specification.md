[日本語](./requirements-specification.ja.md)

# Unified Blueprint (UBP) Requirements Specification

**Version:** 1.0.0
**Status:** Approved
**Created:** 2026-02-07
**Base Document:** PRD v1.0.0 (Product Requirements)
**Integrated Review:** Architect / Backend Engineer / Frontend Engineer / UI/UX Designer / Devil's Advocate

---

## 1. Product Overview and Vision

### 1.1 Product Name

**Unified Blueprint (UBP)**

### 1.2 Concept

**"A familiar notebook for humans. A perfect blueprint for AI."**

Humans simply write documents in Markdown using natural language. The system analyzes them behind the scenes, automatically converting them into "structured data (graph)" and "semantic space (vectors)," providing a foundation where humans and AI agents can share advanced context.

### 1.3 Problems to Solve

| # | Problem | Details | UBP's Solution Approach |
|---|---------|---------|------------------------|
| 1 | Interface Mismatch | Humans prefer natural language; AI prefers structured data. Notion is too ambiguous and causes hallucinations; JSON/YAML is painful for humans | Provide a Markdown editor for humans, and structured context via graph + vectors through MCP Server for AI |
| 2 | Context "Quantity" vs "Quality" Dilemma | AI context windows are finite. Full-text search RAG picks up irrelevant information as noise where keywords match but context differs | Graph-Aware Retrieval provides only highly relevant information through hybrid ranking that combines vector similarity and graph proximity |
| 3 | Loss of "Tacit Knowledge" | Experienced developers' mental maps (relationships between features and tables, etc.) are not made explicit in flat Markdown. AI cannot predict impact scope and introduces bugs | Make implicit dependencies explicit through graph structure with `[[Link]]`. Enable expressing relationship types with link labels (`[[page\|depends_on]]`) |
| 4 | Document Decay | Documents are not auto-updated when code changes. A vicious cycle where AI generates non-working code from outdated documents | Manage association with code files through `source_refs` in frontmatter, and auto-detect/warn about document decay via Staleness Detection |

### 1.4 Core Values

1. **Frictionless Writing:** Users can focus on writing like a wiki without being aware of "nodes" or "edges"
2. **Implicit Structuring:** The system automatically builds dependency graphs from `[[Link]]` syntax and document structure
3. **Semantic Portability:** All documents are maintained as plain Markdown files, manageable and shareable via Git

### 1.5 Differentiation from Existing Tools

Differentiation points from Obsidian + plugin configuration:

- **First-class MCP Server Support:** Providing structured context to AI agents is at the core of the design. Achieves composite context retrieval of semantic search + graph traversal in a single tool call
- **Zero-Config Structuring:** After installation, everything from `ubp init` to document creation to AI integration works without additional plugin configuration
- **CLI-first Design:** Validate CLI tool core value in Phase 0, and provide editor UI incrementally. Assumes co-use with existing editors (VS Code, Obsidian, etc.)

---

## 2. User Personas

### 2.1 Primary: Tech Lead / Architect

- **Profile:** Startup tech lead, in a position to lead the team
- **Challenge:** No time to document designs in their head. Even when written, AI cannot accurately interpret them
- **Goal:** Write thoughts in natural language while auto-generating structured design documents that AI can understand
- **Technical Skill:** High. Comfortable with CLI operations. VS Code / Obsidian user
- **UX Expectations:** Keyboard-centric operations. Fast page switching. No unnecessary UI

### 2.2 Secondary: Backend Engineer

- **Profile:** Web application engineer
- **Challenge:** Wants to quickly find only the information relevant to their scope from existing design documents
- **Goal:** Pass accurate context to AI (Claude Code, etc.) to improve implementation accuracy
- **Technical Skill:** Medium to high. Accustomed to document creation in Notion
- **UX Expectations:** Fast search. Visual understanding of link dependencies

### 2.3 Tertiary (Future Support): Product Manager

- **Challenge:** Discrepancies with engineers arise even after writing requirements specifications
- **Goal:** Just by writing requirements, both engineers and AI can share the same context
- **UX Expectations:** GUI-based operations. Rich toolbars and buttons
- **Timeline:** Phase 2 and beyond. However, maintain an architecture that makes it easy to add GUI elements later

---

## 3. File Format Specification

### 3.1 Basic Policy

Adopts a hybrid approach of **Markdown files + SQLite metadata**.

- Document bodies are maintained as plain Markdown files (Git diff possible, no lock-in risk)
- Graph structure, vector data, and metadata are managed in a SQLite database (fast queries, ACID compliant)
- Documents are readable as-is even without UBP

### 3.2 Directory Structure

```
project-root/
├── pages/                          # Markdown files (human-editable)
│   ├── login-feature.md
│   ├── user-db.md
│   └── ...
├── .ubp/                           # UBP metadata directory
│   ├── manifest.json               # Project config & schema version
│   └── metadata.db                 # SQLite database (graph + vectors + FTS)
└── .gitignore                      # Excludes .ubp/metadata.db
```

### 3.3 Git Management Policy

| Target | Git Managed | Reason |
|--------|-------------|--------|
| `pages/*.md` | Yes | Text files. Diffable and mergeable |
| `.ubp/manifest.json` | Yes | Project settings. Text-based, diff manageable |
| `.ubp/metadata.db` | Excluded | Binary file. Regenerable with `ubp rebuild` command |

### 3.4 manifest.json Specification

```json
{
  "version": "1.0.0",
  "schema_version": 1,
  "embedding_model": {
    "name": "all-MiniLM-L6-v2",
    "version": "1.0",
    "dimensions": 384
  },
  "pages_dir": "pages",
  "created_at": "2026-02-07T00:00:00Z"
}
```

### 3.5 Page File Specification

Each page is saved as a Markdown file within the `pages/` directory.

```markdown
---
id: 01234567-89ab-cdef-0123-456789abcdef
title: Login Feature
type: spec
source_refs:
  - src/auth/login.ts
  - src/auth/middleware.ts
created_at: 2026-02-07T00:00:00Z
updated_at: 2026-02-07T12:00:00Z
---

# Login Feature

User information references the [[UserDB]] table.
The authentication flow conforms to [[OAuth2.0 Spec|depends_on]].
```

- Metadata managed via frontmatter (YAML)
- Filenames use the page title directly (Japanese allowed)
- IDs use UUID v7 (timestamped, sortable)

#### Frontmatter Field Definitions

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `id` | Required | string | UUID v7. Auto-generated by system |
| `title` | Required | string | Page title |
| `type` | Optional | string | Page type. One of `spec` / `design` / `db-schema` / `api` / `config` / `guide`. Defaults to `spec` |
| `source_refs` | Optional | string[] | Paths to related source code files (relative to project root). Used for staleness detection |
| `created_at` | Required | string | ISO 8601. Auto-generated by system |
| `updated_at` | Required | string | ISO 8601. Auto-updated by system on save |

---

## 4. Functional Requirements

### 4.1 Phase 0: CLI Foundation

Phase 0 provides CLI tools for core value validation. No editor UI is included; users edit Markdown in any text editor (VS Code, Obsidian, etc.).

#### 4.1.1 `ubp init`

- Initializes a UBP project in the current directory
- Generates `pages/` directory, `.ubp/manifest.json`, and `.ubp/metadata.db`
- Adds `.ubp/metadata.db` to `.gitignore`

#### 4.1.2 `ubp add <file>`

- Adds specified Markdown file (or all files under `pages/`) to the index
- Parses Markdown, extracts `[[Link]]`, and builds the graph
- Generates embeddings and adds to vector index

#### 4.1.3 `ubp search <query>`

- Executes hybrid search via **Graph-Aware Retrieval**
  - Scoring combining vector similarity and graph proximity: `final_score = α * vector_similarity + (1-α) * graph_proximity` (α default: 0.7)
  - Graph proximity: Inverse of hop distance from the most relevant page to the query
- Displays score breakdown (vector similarity, graph distance) in search results
- Option: `--fulltext` to switch to full-text search (FTS5) mode
- Option: `--limit N` to limit result count (default: 5)
- Option: `--alpha N` to adjust vector similarity weight (0.0-1.0, default: 0.7)

#### 4.1.4 `ubp graph [page]`

- Outputs link relationships between pages in text or JSON format
- If `page` is specified, outputs N-hop exploration results centered on that page
- Option: `--depth N` to specify exploration depth (default: 2)
- Option: `--format json|text` to specify output format

#### 4.1.5 `ubp rebuild`

- Re-parses all Markdown files under `pages/` and rebuilds graph and vector indices
- Used after embedding model changes or metadata regeneration after Git merges

#### 4.1.6 `ubp mcp-server`

- Starts the MCP Server with stdio transport
- Used by connecting from AI tools like Claude Code / Claude Desktop
- See Section 8 "MCP Server Interface Definition" for details

#### 4.1.7 `ubp status`

- Displays current project state (page count, link count, vectorized page count, unindexed page count)
- **Staleness Detection:** For pages with `source_refs` configured, compares the last modification date of referenced code files with the page's last update date, and warns about pages that may be outdated
  - Freshness status: `fresh` (document is newer than code) / `possibly_stale` (code updated but document not updated, within 7 days) / `stale` (code updated but document not updated, over 7 days)
  - Example: `[STALE] login-feature.md — src/auth/login.ts was updated on 2026-02-05`

#### 4.1.8 `ubp stale`

- Dedicated command to list pages with `possibly_stale` or `stale` freshness status
- Option: `--json` for JSON format output (for CI/CD integration)
- Usable as Git pre-commit hook: `ubp stale --exit-code` returns non-zero exit code when stale pages exist

#### 4.1.9 `ubp suggest-links`

- Automatic implicit link suggestion: Detects page pairs with high vector similarity (above threshold) that are not linked, and suggests them as link candidates
- Option: `--threshold N` to adjust similarity threshold (0.0-1.0, default: 0.8)
- Option: `--limit N` to limit suggestion count (default: 10)
- Output example: `[0.92] login-feature.md <-> session-management.md — No link exists, but content is similar`

### 4.2 Phase 1: Architect Viewer (Web Editor)

Based on Phase 0 validation results, provides a web-based dedicated editor.

#### 4.2.1 Launch Method

```bash
npx ubp viewer
```

Starts a local server and opens in browser.

#### 4.2.2 Markdown Editor

- Provides a CodeMirror 6-based Markdown editor
- Source mode (raw Markdown editing) as default
- Floating toolbar on text selection (bold, italic, link, etc.)
- Focus mode (close side panel, show editor only)

#### 4.2.3 Smart Linking

- Displays autocomplete panel on `[[` input
  - Fuzzy match search of existing page names (Japanese IME compatible)
  - Candidate display: max 8 items, up/down keys to select, Enter/Tab to confirm, Esc to cancel
  - When no matching page exists, shows "Create new: {page name}" option
- Auto-generates empty page when link target doesn't exist
- Link hover preview: tooltip showing first 200 characters of linked page (300ms delay)
- Ctrl+Click (Cmd+Click) to jump to linked page
- Links to nonexistent pages shown with red wavy underline

#### 4.2.4 Backlink Panel

- Displays list of "pages that reference this page" at the bottom of the page
- Each backlink shows the link source context (surrounding text)
- Clicking a backlink navigates to the source page

#### 4.2.5 Sidebar Navigation

- Page list (flat list, sortable by update date and title)
- Favorites / pinning
- Recently opened pages

#### 4.2.6 Global Search (Cmd+K / Ctrl+K)

- Command palette-style unified search UI
- Fuzzy match search of page titles
- Full-text search (FTS5)
- Search results show page title + matched context snippet

#### 4.2.7 Real-time Sync

- Editor input content is automatically saved to local file
- Debounce strategy:
  - Key input: 300ms
  - Paste / page navigation / focus lost: immediate
  - Idle detection: 2000ms
- Save state indicator: "Saved" / "Saving..." / "Unsaved changes"

#### 4.2.8 Link Labels (Typed Links)

- Links can be labeled (typed) using pipe-delimited syntax `[[page name|label]]`
  - Example: `[[UserDB|depends_on]]`, `[[OAuth2.0 Spec|implements]]`
- Predefined labels: `depends_on` / `implements` / `extends` / `references` (default) / `conflicts_with`
- Without label (`[[page name]]`) is treated as `references`
- After `[[` input autocomplete, entering `|` after page name confirmation shows label candidates
- Editor displays color-coded labels (e.g., `depends_on` in blue, `conflicts_with` in red)

#### 4.2.9 Automatic Implicit Link Suggestions

- Auto-detects page pairs with high vector similarity (threshold: 0.8+) that are not linked
- Displays as "link candidates" in sidebar or page bottom
- One-click to accept (insert link) / dismiss (hide)
- Suggestions are calculated in background without affecting editor responsiveness

#### 4.2.10 Freshness Indicator

- Visually displays freshness status in page list and editor header
  - Green (Fresh): Document is up to date
  - Yellow (Possibly Stale): Related code updated but document not updated (within 7 days)
  - Red (Stale): Related code updated but document not updated (over 7 days)
  - Gray: `source_refs` not set (not tracked for freshness)
- When opening a stale page, displays warning banner at editor top: "Related code (src/auth/login.ts) has been updated. We recommend reviewing the document"
- Sidebar page list also shows freshness status via icons

#### 4.2.11 Dark Mode

- Provides 2 themes: light / dark
- CSS Custom Properties-based theme system
- Uses OS setting (`prefers-color-scheme`) as initial value

### 4.3 Phase 2: Extended Features

The following features are considered for Phase 2 and beyond.

| Feature | Overview | Prerequisites | Related Problem |
|---------|----------|---------------|-----------------|
| Graph View | Graph visualization with Cytoscape.js (local graph + global graph). Includes hop distance visualization | Stable Phase 1 operation | Problem 3 |
| AI Auto Page Creation | Feature for AI to create/update pages via MCP Server | Stable MCP read operations | Problem 4 |
| AI Change Review UI | Git PR-like diff display, approve/modify/reject actions. Audit log of AI changes | AI Auto Page Creation implemented | Problem 4 |
| AI Context Visualization | "How AI sees it" preview panel. Highlight AI reference scope on graph | Stable MCP Server + Graph View | Problem 1 |
| Staleness Dashboard | Dashboard screen showing project-wide freshness status. Batch management of stale pages | Stable staleness detection | Problem 4 |
| Structuring Confidence Score | Confidence display for auto-structuring. Request user review of low-confidence structures | Stable link label feature | Problem 3 |
| Impact Analysis | `ubp_get_impact`: Estimate impact chains from combinations of page types (spec/db-schema/api, etc.) | Stable link labels + page types | Problem 3 |
| Bidirectional Code-Document Links | Directly reference code files with `[[src/auth/login.ts]]`. Reverse lookup from code side also possible | Stable Staleness Detection | Problem 4 |
| Context Window Budget | Budget management for token count returned by MCP Server. Context optimization through cap setting and prioritization | Stable MCP Server | Problem 2 |
| Desktop App | Lightweight desktop app via Tauri | Phase 1 web version validation complete | - |
| VS Code Extension | Use UBP features within VS Code | UBP Core as library | - |
| Tag System | Page classification via `#tag` format tags | Stable page management | - |
| Template Feature | Templates for frequently used page structures | Stable editor | - |
| Import Feature | Batch import from Obsidian vault / Notion export | Stable file structure | - |
| Multi-User Concurrent Editing | Concurrent editing via CRDT (Yjs, etc.) | Future consideration | - |

---

## 5. Non-Functional Requirements

### 5.1 Local First

- All core features (editing, link analysis, graph construction, search, MCP Server) must work in a local environment (offline) without depending on external SaaS
- Embedding generation is executed locally via ONNX Runtime
- Network connection is required only for the initial embedding model download (~80MB)
- Downloaded models are cached locally, operating offline thereafter

### 5.2 Git Friendly

- Document bodies (`pages/*.md`) must be manageable as plain Markdown in Git
- Document change diffs must be viewable with `git diff`
- Metadata DB (`.ubp/metadata.db`) must be excluded via `.gitignore` and regenerable with `ubp rebuild`
- Documents must render in GitHub's Web UI

### 5.3 Performance

Performance targets for documents at the 1000-page scale:

| Operation | Target Response Time |
|-----------|---------------------|
| Editor key input to rendering | < 16ms (60fps) |
| Page save (sync portion) | < 50ms |
| Page switching | < 100ms |
| `[[Link]]` completion candidate display | < 50ms |
| Full-text search (FTS5) | < 100ms |
| Semantic search (Top-5) | < 200ms |
| Link graph retrieval (depth=2) | < 100ms |
| Page list retrieval | < 50ms |
| Embedding generation (1 page) | < 50ms |
| Full initial embedding (1000 pages) | < 60 seconds (background) |

### 5.4 Data Integrity

- Page saves must be immediately committed to the filesystem
- Embedding generation must run asynchronously in the background without blocking editor responsiveness
- No data loss on application crash (ACID guarantee via SQLite WAL mode)

### 5.5 Portability

- Must work on major platforms: macOS, Linux, Windows
- Must work on Node.js v18 or higher
- Must support instant execution via `npx`

---

## 6. Technology Stack (Recommended)

### 6.1 Phase 0: CLI

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Language | TypeScript (Node.js) | Ecosystem maturity, type safety |
| CLI Framework | commander / citty | Lightweight with sufficient features |
| Markdown Parser | remark / unified | Rich plugin ecosystem. Custom parser for `[[Link]]` implementable |
| Database | better-sqlite3 | Synchronous API, fast, good Node.js integration |
| Full-Text Search | SQLite FTS5 | Built into better-sqlite3. No additional dependencies |
| Vector Search | In-memory (cosine similarity) | Brute-force is fast enough at 1000-page scale. Can migrate to sqlite-vec in the future |
| Embedding | ONNX Runtime (onnxruntime-node) + all-MiniLM-L6-v2 | Local execution, fast, Node.js bindings |
| MCP Server | @modelcontextprotocol/sdk | Official SDK. stdio transport |
| File Watching | chokidar | Cross-platform file watcher |
| Monorepo | pnpm workspaces | Package management efficiency |

### 6.2 Phase 1: Architect Viewer

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Editor | CodeMirror 6 | Modular design, virtual rendering, custom syntax extensions, IME support |
| HTTP Server | Hono | Lightweight, fast, TypeScript-first |
| Web Framework | To be decided in design phase | Selected considering Phase 0 results and team's tech stack |
| Graph Visualization (Phase 2) | Cytoscape.js | Framework-agnostic, graph-focused, rich layout algorithms |

### 6.3 Japanese Language Support

- Start MVP with embedding model `all-MiniLM-L6-v2` (384 dimensions, ~80MB)
- If Japanese search accuracy issues arise, migrate to `paraphrase-multilingual-MiniLM-L12-v2` (50 languages, ~470MB)
- Full-text search supports Japanese via SQLite FTS5 + unicode61 tokenizer

---

## 7. Data Model (Schema Definition)

### 7.1 SQLite Schema

```sql
-- Pragma settings
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -64000;         -- 64MB cache
PRAGMA mmap_size = 268435456;       -- 256MB memory map
PRAGMA temp_store = MEMORY;
PRAGMA foreign_keys = ON;

-- Pages (node) table
CREATE TABLE pages (
    id TEXT PRIMARY KEY,              -- UUID v7
    title TEXT NOT NULL UNIQUE,       -- Page title
    file_path TEXT NOT NULL UNIQUE,   -- Relative path from pages/
    body_hash TEXT,                   -- SHA-256 hash of content (for diff detection)
    created_at TEXT NOT NULL,         -- ISO 8601
    updated_at TEXT NOT NULL          -- ISO 8601
);

-- Links (edge) table
CREATE TABLE links (
    source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'references',  -- Edge type (MVP: references only)
    context TEXT,                     -- Context where link appears (50 chars before/after)
    created_at TEXT NOT NULL,
    PRIMARY KEY (source_page_id, target_page_id)
);

-- Vectors table
CREATE TABLE page_vectors (
    page_id TEXT PRIMARY KEY REFERENCES pages(id) ON DELETE CASCADE,
    embedding BLOB NOT NULL,          -- Float32Array binary (384 dimensions x 4 bytes = 1536 bytes)
    model_version TEXT NOT NULL,      -- Embedding model version
    source_hash TEXT NOT NULL,        -- body_hash at vectorization time (for incremental updates)
    updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX idx_pages_title ON pages(title);
CREATE INDEX idx_pages_updated_at ON pages(updated_at);
CREATE INDEX idx_links_target ON links(target_page_id);
CREATE INDEX idx_links_type ON links(type);
CREATE INDEX idx_vectors_model ON page_vectors(model_version);

-- Source code reference freshness tracking table (for Staleness Detection)
CREATE TABLE source_refs_state (
    page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,               -- Source code file path
    last_synced_hash TEXT,                 -- SHA-256 hash at last sync check
    last_synced_at TEXT,                   -- Last sync check time (ISO 8601)
    is_stale BOOLEAN NOT NULL DEFAULT 0,   -- Freshness flag
    PRIMARY KEY (page_id, file_path)
);

-- Implicit link suggestion table
CREATE TABLE suggested_links (
    source_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    target_page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    similarity_score REAL NOT NULL,        -- Vector similarity score
    status TEXT NOT NULL DEFAULT 'pending', -- pending / accepted / dismissed
    suggested_at TEXT NOT NULL,             -- ISO 8601
    resolved_at TEXT,                       -- Accepted/dismissed time
    PRIMARY KEY (source_page_id, target_page_id)
);

-- Additional indexes
CREATE INDEX idx_source_refs_stale ON source_refs_state(is_stale) WHERE is_stale = 1;
CREATE INDEX idx_suggested_links_status ON suggested_links(status);

-- FTS5 full-text search
CREATE VIRTUAL TABLE pages_fts USING fts5(
    title,
    body,
    content='pages',
    content_rowid='rowid',
    tokenize='unicode61'
);
```

### 7.2 Node Model

```typescript
interface Page {
    id: string;           // UUID v7
    title: string;        // Page title
    filePath: string;     // Relative path from pages/
    body: string;         // Markdown content (not stored in DB, read from file)
    bodyHash: string;     // SHA-256 hash
    createdAt: string;    // ISO 8601
    updatedAt: string;    // ISO 8601
}

interface PageSummary {
    id: string;
    title: string;
    updatedAt: string;
    linkCount: number;    // Outgoing link count
    backlinkCount: number; // Incoming link count
}
```

### 7.3 Edge Model

```typescript
// Link type definitions
type LinkType = 'references' | 'depends_on' | 'implements' | 'extends' | 'conflicts_with';

interface Link {
    sourcePageId: string;
    targetPageId: string;
    type: LinkType;       // Phase 0: references only. Phase 1 adds labeled links
    context: string;      // Context where link appears
    createdAt: string;
}

interface LinkInfo {
    page: PageSummary;    // Summary of linked page
    context: string;      // Link context
    type: LinkType;
}
```

### 7.4 Staleness Tracking Model

```typescript
type StalenessStatus = 'fresh' | 'possibly_stale' | 'stale' | 'untracked';

interface SourceRefState {
    pageId: string;
    filePath: string;         // Source code file path
    lastSyncedHash: string;   // File hash at last sync check
    lastSyncedAt: string;     // ISO 8601
    isStale: boolean;
}

interface PageStaleness {
    pageId: string;
    pageTitle: string;
    status: StalenessStatus;
    staleRefs: Array<{
        filePath: string;
        lastModified: string;  // Code file last modification time
        pageSyncedAt: string;  // Document last sync time
    }>;
}
```

Staleness detection logic:
1. Pages without `source_refs` set are `untracked`
2. If all referenced file hashes match, status is `fresh`
3. If hashes don't match and code file update is within 7 days, status is `possibly_stale`
4. If hashes don't match and code file update exceeds 7 days, status is `stale`

### 7.5 Implicit Link Suggestion Model

```typescript
interface SuggestedLink {
    sourcePageId: string;
    targetPageId: string;
    similarityScore: number;   // 0.0 - 1.0
    status: 'pending' | 'accepted' | 'dismissed';
    suggestedAt: string;
    resolvedAt?: string;
}
```

### 7.6 Graph Traversal (Recursive CTE)

```sql
-- Traverse up to depth hops from center_page_id
WITH RECURSIVE graph AS (
    SELECT source_page_id, target_page_id, 1 AS depth
    FROM links
    WHERE source_page_id = :center_page_id

    UNION ALL

    SELECT l.source_page_id, l.target_page_id, g.depth + 1
    FROM links l
    JOIN graph g ON l.source_page_id = g.target_page_id
    WHERE g.depth < :max_depth
)
SELECT DISTINCT source_page_id, target_page_id, depth FROM graph;
```

- Circular references are permitted (directed graph). Depth limits prevent infinite loops
- Backlink retrieval uses reverse lookup via `idx_links_target` index

### 7.7 Auto-Vectorization Pipeline

```
Page save
    |
    v
body_hash calculation (SHA-256)
    |
    v
Compare with page_vectors.source_hash
    |  (mismatch or not exists)
    v
Embedding generation (async, background)
    |
    v
UPSERT to page_vectors table
```

- Save completes synchronously and immediately (< 50ms)
- Vectorization runs asynchronously after save without blocking editor responsiveness
- Debounce (500ms) suppresses wasteful processing during rapid continuous input
- Before vectorization completes, semantic search uses the previous version's vectors

### 7.8 Smart Linking Parser

```typescript
// Supports labeled links: [[page name]] or [[page name|label]]
const LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface ParsedLink {
    targetTitle: string;    // Link target page title
    linkType: LinkType;     // Label (defaults to 'references' when unspecified)
    position: {
        start: number;
        end: number;
    };
    context: string;        // ~50 characters of surrounding context
}
```

Link update flow:
1. On page save, parse the Markdown body and extract all `[[...]]` patterns
2. For `[[page name|label]]` format, parse the text after the pipe as the link type. Invalid labels fall back to `references`
3. Compare the extracted list of target titles with existing `links` table records
4. Perform differential update:
   - New link: INSERT + auto-generate empty page if target page doesn't exist
   - Deleted link: DELETE
   - Label change: UPDATE (update type column)
   - No change: Do nothing

---

## 8. MCP Server Interface Definition

### 8.1 Transport

- **Protocol:** MCP (Model Context Protocol), JSON-RPC based
- **Transport:** stdio (for Claude Code / Claude Desktop integration)
- **Implementation:** `@modelcontextprotocol/sdk` official SDK

### 8.2 Connection Configuration

```json
{
  "mcpServers": {
    "ubp": {
      "command": "npx",
      "args": ["ubp", "mcp-server"],
      "cwd": "/path/to/project"
    }
  }
}
```

### 8.3 Tool Definitions

#### 8.3.1 `ubp_search` - Graph-Aware Semantic Search

Executes hybrid search via Graph-Aware Retrieval. Returns highly relevant pages through scoring that combines vector similarity and graph proximity. Also includes link information and freshness information for related pages.

```typescript
// Input
{
    query: string;              // Search query (natural language)
    limit?: number;             // Max results (default: 5, max: 20)
    include_linked?: boolean;   // Include linked pages (default: true)
    depth?: number;             // Link exploration depth (default: 1)
    max_tokens?: number;        // Target max response tokens (Context Window Budget)
}

// Output
{
    results: Array<{
        page: {
            id: string;
            title: string;
            body: string;
            updated_at: string;
            staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        };
        score: number;              // Hybrid score (0.0 - 1.0)
        score_breakdown: {
            vector_similarity: number;  // Vector similarity (0.0 - 1.0)
            graph_proximity: number;    // Graph proximity (0.0 - 1.0)
        };
        relevance_reason: "direct_link" | "2hop" | "vector_similarity";  // Primary reason this result was returned
        linked_pages: Array<{
            id: string;
            title: string;
            body: string;
            link_type: string;
            link_context: string;
            staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        }>;
    }>;
    total_pages: number;
}
```

**Scoring Algorithm:**
- `final_score = α * vector_similarity + (1 - α) * graph_proximity` (α = 0.7)
- `graph_proximity`: Inverse of link hop distance from the top hit of search results. Directly linked pages get high scores, distant pages get low scores

**Context Window Budget:** When `max_tokens` is specified, truncates page body from the beginning to fit the overall response within the specified token count. A feature for AI to efficiently use the context window

**Contextual Chunking (Future Extension):** Phase 0 treats entire pages as single vectors, but search accuracy degrades for long pages. Future plans include section-level vectorization based on Markdown heading structure (`##`, `###`) for more fine-grained search. Section-level vectors would be stored in a `page_section_vectors` table, considering a hybrid approach alongside page-level vectors

#### 8.3.2 `ubp_fulltext_search` - Full-Text Search

Keyword-based full-text search. Suitable for searching exact terms and proper nouns.

```typescript
// Input
{
    query: string;              // Search query (keywords)
    limit?: number;             // Max results (default: 10)
}

// Output
{
    results: Array<{
        page: {
            id: string;
            title: string;
            body: string;
        };
        rank: number;
        snippet: string;        // Excerpt of matched section
    }>;
}
```

#### 8.3.3 `ubp_get_page` - Page Retrieval

Retrieves a page by title or ID. Includes link structure and freshness information.

```typescript
// Input
{
    title?: string;
    id?: string;
}

// Output
{
    page: {
        id: string;
        title: string;
        body: string;
        created_at: string;
        updated_at: string;
        staleness: "fresh" | "possibly_stale" | "stale" | "untracked";
        stale_refs?: Array<{        // Only when staleness is stale/possibly_stale
            file_path: string;
            last_modified: string;
        }>;
    };
    outgoing_links: LinkInfo[];
    incoming_links: LinkInfo[];
}
```

**Freshness Information:** Communicates document reliability to AI. Information retrieved from `stale` pages can be used with AI recognizing it "may be outdated"

#### 8.3.4 `ubp_get_context` - Batch Context Retrieval

Retrieves the content of a specified page and its related pages in one batch. A utility for AI to obtain sufficient context in a single tool call.

```typescript
// Input
{
    page_id: string;
    depth?: number;             // Graph exploration depth (default: 1, max: 3)
}

// Output
{
    center_page: {
        id: string;
        title: string;
        body: string;
    };
    related_pages: Array<{
        id: string;
        title: string;
        body: string;
        relation: string;       // "outgoing" | "incoming"
        depth: number;
        link_context: string;
    }>;
    total_size_bytes: number;
}
```

**Response Size Limit:** Maximum 50KB per response. When exceeded, page body is truncated to the first 500 characters.

#### 8.3.5 `ubp_list_pages` - Page List

Retrieves a list of all pages with metadata only.

```typescript
// Input
{
    sort_by?: "title" | "updated_at" | "created_at";
    order?: "asc" | "desc";
}

// Output
{
    pages: Array<{
        id: string;
        title: string;
        updated_at: string;
        outgoing_link_count: number;
        incoming_link_count: number;
    }>;
    total_count: number;
}
```

#### 8.3.6 `ubp_get_graph` - Graph Structure Retrieval

Retrieves the link structure between pages as a graph.

```typescript
// Input
{
    center_page_id?: string;
    depth?: number;             // Default: 2, Max: 5
}

// Output
{
    nodes: Array<{
        id: string;
        title: string;
        link_count: number;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type: string;
    }>;
}
```

### 8.4 Tools Planned for Phase 2

| Tool | Overview |
|------|----------|
| `ubp_create_page` | Create new page. Auto-parses `[[Link]]` in body |
| `ubp_update_page` | Update existing page (full text replacement or append to end) |
| `ubp_check_staleness` | Staleness check for specified or all pages. Returns stale page list and changed code file information |
| `ubp_suggest_links` | Retrieve implicit link candidates. Returns page pairs with high vector similarity that are not linked |
| `ubp_graph_traverse` | N-hop exploration from specified node. Filterable by edge type (`depends_on`, `implements`, etc.). Used for understanding impact scope |
| `ubp_get_impact` | Estimate impact scope on page change. Recursively explores incoming_links to the specified page and returns pages potentially affected by the change |

**Safety Measures for Phase 2 Write Tool Addition:**
- Record audit log of AI changes (log operations to `audit_log` table)
- Provide before/after diff display feature (AI Change Review UI)
- Provide Git PR-like approve/modify/reject workflow in UI
- Provide per-page AI edit lock feature
- Make rate limiting configurable (max operations per minute)

---

## 9. UI/UX Requirements

### 9.1 Screen Layout (Phase 1)

```
+----------------------------------------------------------+
|  [Logo] [Search Bar (Cmd+K)]         [Settings] [Theme]  |
+----------+-----------------------------------------------+
|          |                                               |
| Side     |  Main Editor Area (CodeMirror 6)              |
| Panel    |                                               |
|          |  +-------------------------------------------+ |
| - Page   |  | # Page Title                              | |
|   List   |  |                                           | |
| - Favo-  |  | Body text...                              | |
|   rites  |  | [[Links]] are highlighted                  | |
| - Recent |  |                                           | |
|   Pages  |  +-------------------------------------------+ |
|          |  | Backlinks: Pages referencing this page     | |
|          |  +-------------------------------------------+ |
|          |                                               |
+----------+-----------------------------------------------+
|  Save State Indicator           | Page Stats (link count) |
+----------------------------------------------------------+
```

### 9.2 Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Global Search | Cmd+K | Ctrl+K |
| Force Page Save | Cmd+S | Ctrl+S |
| Toggle Sidebar | Cmd+B | Ctrl+B |
| Focus Mode | Cmd+Shift+F | Ctrl+Shift+F |
| New Page | Cmd+N | Ctrl+N |
| Go to Previous Page | Cmd+[ | Alt+Left |
| Go to Next Page | Cmd+] | Alt+Right |

### 9.3 Empty State

Display the following on first launch:
- Project state (page count: 0)
- "Create your first page" button
- Quick start guide (displayed inline)

### 9.4 Accessibility (MVP Minimum Requirements)

- Provide keyboard shortcuts for all major features
- Tab/Shift+Tab focus movement in logical order
- Text-to-background contrast ratio of 4.5:1 or higher (WCAG AA)
- Dark mode / light mode toggle support

### 9.5 Performance UX

- Always-visible auto-save indicator
- Incremental search result display (real-time updates during input)
- Skeleton loading on page switching

---

## 10. Risks and Mitigations

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | Insufficient Japanese accuracy of local embeddings | High | Validate `all-MiniLM-L6-v2` in MVP; migrate to `paraphrase-multilingual-MiniLM-L12-v2` if insufficient. Provide FTS5 full-text search as constant fallback |
| 2 | `[[Link]]` alone provides insufficient structuring granularity | Medium | Introduce link label syntax (`[[page\|depends_on]]`) in Phase 1. Mitigate missing links with automatic implicit link suggestions. NLP-based implicit relationship extraction deferred to Phase 2+ |
| 3 | Insufficient differentiation from Obsidian + plugins | High | Validate CLI tool + MCP Server core value as quickly as possible in Phase 0. Strengthen differentiation points based on user feedback |
| 4 | MVP development scope too broad | High | Validate core value with Phase 0 (CLI tools) before proceeding to Phase 1. Custom editor decision depends on Phase 0 results |
| 5 | Japanese IME issues with CodeMirror 6 | Medium | Conduct early IME testing. Switch to ProseMirror (TipTap) base if issues occur |
| 6 | Performance degradation at 1000-page scale | Medium | Make async embedding generation mandatory. Minimize re-parsing with incremental updates. Apply SQLite PRAGMA tuning |
| 7 | Data inconsistency from concurrent editing with external editors | Medium | Detect external changes via chokidar file watching. Last Write Wins is sufficient (assuming Local First personal use) |
| 8 | Unintended mass page generation by AI (via MCP) | Medium | Introduce rate limiting and confirmation prompts when adding write tools in Phase 2 |
| 9 | Cross-platform issues with Japanese filenames | Low | Major OSes (macOS/Linux/Windows) support Japanese filenames. Migrate to slug-based naming if issues arise |
| 10 | SQLite metadata DB corruption | Low | Full rebuild possible with `ubp rebuild` command. Source is Markdown files, so no data loss occurs |
| 11 | Divergence between code and documents (Problem 4) | High | Auto-detect freshness with Staleness Detection. Warn about commits with stale documents via `ubp stale --exit-code` Git pre-commit hook integration. CI/CD pipeline integration also possible |
| 12 | Insufficient auto-structuring accuracy (Problem 3) | Medium | Validate with explicit `[[Link]]`-based links only in Phase 0 to minimize accuracy risk. Introduce implicit link suggestions (vector similarity-based) in Phase 1, requiring user acceptance/dismissal to prevent incorrect structuring. Future plans include structuring confidence scores to request user review of low-confidence structures |

---

## 11. Future Considerations

### 11.1 Items to Decide in Design Phase

| # | Item | Deadline |
|---|------|----------|
| 1 | Phase 1 Web framework selection (Next.js / SvelteKit / Vite + React, etc.) | After Phase 0 completion |
| 2 | Page filename naming convention (Japanese as-is vs slug-based) | Before Phase 0 development start |
| 3 | Japanese accuracy benchmark for embedding model | During Phase 0 development |
| 4 | Safety design for MCP Server write tools (create/update) | After Phase 1 completion |

### 11.2 Long-Term Considerations

- **Obsidian Plugin Version:** Consider providing as an Obsidian plugin in addition to an independent product
- **Multi-User Support:** Concurrent editing with CRDT-based approach (Yjs, etc.). Methods to coexist with Local First philosophy
- **NLP-Based Implicit Structuring:** Relationship extraction from natural language beyond `[[Link]]`. Define accuracy and reliability requirements
- **Vector DB Scaling:** Migrate to index-based search like sqlite-vec when supporting 10,000+ pages
- **Embedding Model Update Strategy:** Automation of full vector recalculation when models change (record model version in manifest.json, regenerate with ubp rebuild)
- **Page Deletion Semantics:** `[[Link]]` to deleted pages maintained as "broken link" state with UI warnings
- **Circular Reference Handling:** Graph permits circular references as a directed graph. UI provides cycle detection and warnings
- **Testing Strategy:** Establish unit test and integration test strategy early for each component (parser, vector engine, MCP Server). Protocol conformance testing for MCP Server is particularly important
- **Graph-Aware Retrieval Alpha Tuning:** Balance of vector similarity and graph proximity (α = 0.7) to be adjusted based on A/B testing with real data
- **Staleness Detection Threshold Optimization:** Make the day threshold for stale judgment (currently 7 days) customizable according to project scale and development speed
- **Git Pre-commit Hook Integration:** Establish operational patterns for incorporating `ubp stale --exit-code` into CI/CD pipelines and pre-commit hooks
