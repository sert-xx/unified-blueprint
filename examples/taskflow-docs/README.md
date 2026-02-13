# TaskFlow — UBP Sample Documentation

A complete set of design documents for **TaskFlow**, a fictional task management platform. This sample demonstrates all UBP features: WikiLink-based Document Graph, hybrid search, staleness detection, and multi-directory organization.

## Directory Structure

```
taskflow-docs/
├── designs/                           # System design documents
│   ├── architecture.md                  3-layer architecture overview
│   ├── database.md                      Schema and migration strategy
│   ├── authentication.md                JWT, OAuth2, RBAC design
│   └── realtime-notifications.md        WebSocket notification system
├── specs/                             # Formal specifications
│   ├── search-and-filtering.md          Task search query syntax
│   └── performance-requirements.md      Latency, throughput, SLA targets
├── api/                               # API reference
│   ├── rest-endpoints.md                Full REST API (CRUD, errors, pagination)
│   └── websocket-events.md              Real-time event protocol
├── guides/                            # How-to guides
│   ├── deployment.md                    Docker, env vars, monitoring
│   └── local-development.md             Dev environment setup
├── adrs/                              # Architecture Decision Records
│   ├── 001-database-choice.md           PostgreSQL vs MongoDB vs MySQL
│   └── 002-auth-strategy.md             JWT vs Sessions vs API Keys
├── meetings/                          # Meeting notes
│   ├── 2024-01-15-kickoff.md            Project kickoff
│   └── 2024-02-01-sprint-review.md      Sprint 1 review
└── todos/                             # Task tracking
    └── v1-launch-checklist.md           Pre-launch checklist
```

**15 documents, 7 `doc_type` values, 5 WikiLink types, 3 files with `source_refs`**

## Quick Start

```bash
cd examples/taskflow-docs

# Initialize UBP (builds the Document Graph + search index)
ubp init --docs-dir .

# Check status
ubp status
```

## Try These Searches

UBP's hybrid search combines vector similarity, full-text matching, and graph proximity. These queries demonstrate cross-directory discovery:

```bash
# Finds results in designs/, api/, adrs/ — spans 3 directories
ubp search "authentication"

# Finds results in designs/, specs/ — connects schema to performance
ubp search "database performance"

# Finds results in designs/, api/ — links design to implementation
ubp search "WebSocket events"

# Finds results in specs/, api/ — traces spec to endpoint
ubp search "task filtering pagination"

# Finds results in guides/, designs/ — connects ops to architecture
ubp search "deployment Docker"
```

## Explore the Graph

```bash
# Full graph overview
ubp graph

# Architecture is the central hub — see its connections
ubp graph --center designs/architecture

# Trace how a decision flows through the docs
ubp graph --center adrs/001-database-choice --depth 2
```

## Check Staleness

Three design documents reference source files via `source_refs`. Since these files don't exist in this sample, they will all appear stale:

```bash
ubp stale
```

| Document | source_refs |
|----------|------------|
| `designs/architecture.md` | `src/api/router.ts`, `src/services/taskService.ts`, `src/middleware/errorHandler.ts` |
| `designs/database.md` | `src/models/user.ts`, `src/models/task.ts`, `src/models/project.ts`, `src/db/migrations/` |
| `designs/authentication.md` | `src/auth/jwt.ts`, `src/auth/oauth.ts`, `src/middleware/authMiddleware.ts` |

## Discover Missing Links

```bash
ubp suggest-links
```

UBP analyzes document content and suggests WikiLinks that could be added based on semantic similarity and shared concepts.

## WikiLink Types Used

This sample uses all 5 supported link types:

| Link Type | Example | Meaning |
|-----------|---------|---------|
| `references` | `[[designs/architecture\|references]]` | General reference |
| `depends_on` | `[[designs/database\|depends_on]]` | Hard dependency |
| `implements` | `[[api/websocket-events\|implements]]` | Implements a design |
| `extends` | `[[api/rest-endpoints\|extends]]` | Extends another API |
| `conflicts_with` | `[[adrs/001-database-choice\|conflicts_with]]` | Conflicting decision |

## doc_type Coverage

| doc_type | Count | Directory |
|----------|-------|-----------|
| `design` | 4 | `designs/` |
| `spec` | 2 | `specs/` |
| `api` | 2 | `api/` |
| `guide` | 2 | `guides/` |
| `adr` | 2 | `adrs/` |
| `meeting` | 2 | `meetings/` |
| `todo` | 1 | `todos/` |
