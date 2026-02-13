---
title: Database Design
doc_type: design
source_refs:
  - src/models/user.ts
  - src/models/task.ts
  - src/models/project.ts
  - src/db/migrations/
---

# Database Design

## Overview

TaskFlow uses PostgreSQL 16 as its primary relational data store. The schema is designed around four core entities: **Users**, **Tasks**, **Projects**, and **Comments**. All tables use UUIDs as primary keys, include standard audit columns (`created_at`, `updated_at`), and enforce referential integrity through foreign key constraints.

This document defines the complete schema, index strategy, and migration procedures.

Related documents:

- [[designs/architecture|depends_on]]
- [[adrs/001-database-choice|references]]

## Schema Design

The entity-relationship diagram below shows the core tables and their relationships:

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    users     │       │      tasks       │       │   projects   │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)      │──┐    │ id (PK)          │    ┌──│ id (PK)      │
│ email        │  │    │ title            │    │  │ name         │
│ display_name │  │    │ description      │    │  │ description  │
│ password_hash│  ├───►│ assignee_id (FK) │    │  │ owner_id(FK) │
│ avatar_url   │  │    │ creator_id (FK)  │◄───┘  │ status       │
│ role         │  │    │ project_id (FK)  │───────►│ created_at   │
│ status       │  │    │ status           │       │ updated_at   │
│ created_at   │  │    │ priority         │       │ archived_at  │
│ updated_at   │  │    │ due_date         │       └──────────────┘
│ last_login_at│  │    │ created_at       │
└──────────────┘  │    │ updated_at       │
                  │    │ completed_at     │
                  │    └──────────────────┘
                  │
                  │    ┌──────────────────┐
                  │    │    comments      │
                  │    ├──────────────────┤
                  └───►│ id (PK)          │
                       │ task_id (FK)     │
                       │ author_id (FK)   │
                       │ body             │
                       │ created_at       │
                       │ updated_at       │
                       └──────────────────┘

                  ┌──────────────────────┐
                  │  project_members     │
                  ├──────────────────────┤
                  │ project_id (FK)(PK)  │
                  │ user_id (FK)(PK)     │
                  │ role                 │
                  │ joined_at            │
                  └──────────────────────┘
```

## Users Table

The `users` table stores account credentials, profile information, and system-level role assignments.

```sql
CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    display_name  VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255),
    avatar_url    VARCHAR(512),
    role          VARCHAR(20)  NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'manager', 'member', 'guest')),
    status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'suspended', 'deactivated')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
```

| Column          | Type           | Constraints                          | Notes                              |
|-----------------|----------------|--------------------------------------|------------------------------------|
| `id`            | UUID           | PK, default `gen_random_uuid()`     | Immutable after creation           |
| `email`         | VARCHAR(255)   | NOT NULL, UNIQUE                     | Used for login and notifications   |
| `display_name`  | VARCHAR(100)   | NOT NULL                             | Shown in UI and mentions           |
| `password_hash` | VARCHAR(255)   | Nullable                             | NULL when using OAuth exclusively  |
| `avatar_url`    | VARCHAR(512)   | Nullable                             | Points to object storage           |
| `role`          | VARCHAR(20)    | NOT NULL, CHECK, default `member`    | System-wide role                   |
| `status`        | VARCHAR(20)    | NOT NULL, CHECK, default `active`    | Account lifecycle state            |
| `created_at`    | TIMESTAMPTZ    | NOT NULL, default `now()`            | Immutable                          |
| `updated_at`    | TIMESTAMPTZ    | NOT NULL, default `now()`            | Updated via trigger                |
| `last_login_at` | TIMESTAMPTZ    | Nullable                             | Updated on each successful login   |

The `password_hash` column is nullable to support OAuth-only accounts. When a user registers through an OAuth provider, no password is set. If they later add a password, it is hashed using Argon2id. See [[designs/authentication]] for the full authentication flow.

## Tasks Table

The `tasks` table is the central entity of the application. Each task belongs to exactly one project and may optionally be assigned to a user.

```sql
CREATE TABLE tasks (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    title        VARCHAR(300) NOT NULL,
    description  TEXT,
    assignee_id  UUID         REFERENCES users(id) ON DELETE SET NULL,
    creator_id   UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    project_id   UUID         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status       VARCHAR(20)  NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'in_progress', 'in_review', 'done', 'cancelled')),
    priority     SMALLINT     NOT NULL DEFAULT 3
                 CHECK (priority BETWEEN 1 AND 5),
    due_date     DATE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);
```

| Column         | Type          | Constraints                           | Notes                              |
|----------------|---------------|---------------------------------------|------------------------------------|
| `id`           | UUID          | PK, default `gen_random_uuid()`      | Immutable                          |
| `title`        | VARCHAR(300)  | NOT NULL                              | Displayed in list and detail views |
| `description`  | TEXT          | Nullable                              | Markdown-formatted body            |
| `assignee_id`  | UUID          | FK -> users, ON DELETE SET NULL       | NULL means unassigned              |
| `creator_id`   | UUID          | FK -> users, NOT NULL, ON DELETE RESTRICT | Creator cannot be deleted while tasks exist |
| `project_id`   | UUID          | FK -> projects, NOT NULL, ON DELETE CASCADE | Deleting project removes all tasks |
| `status`       | VARCHAR(20)   | NOT NULL, CHECK, default `open`       | Enforced state machine             |
| `priority`     | SMALLINT      | NOT NULL, CHECK 1-5, default `3`      | 1 = critical, 5 = lowest           |
| `due_date`     | DATE          | Nullable                              | Used for calendar views            |
| `created_at`   | TIMESTAMPTZ   | NOT NULL, default `now()`             | Immutable                          |
| `updated_at`   | TIMESTAMPTZ   | NOT NULL, default `now()`             | Updated via trigger                |
| `completed_at` | TIMESTAMPTZ   | Nullable                              | Set when status transitions to `done` |

### Task Status State Machine

Tasks follow a controlled set of status transitions:

```
         ┌──────────┐
         │   open   │
         └────┬─────┘
              │
              ▼
       ┌─────────────┐
       │ in_progress  │◄──────────────┐
       └──────┬───────┘               │
              │                       │
              ▼                       │
        ┌───────────┐          (reopen)
        │ in_review  │────────────────┘
        └─────┬──────┘
              │
              ▼
         ┌──────────┐
         │   done   │
         └──────────┘

  Any state ──────────► cancelled
```

## Projects Table

The `projects` table represents workspaces that contain tasks. Each project has a single owner and zero or more additional members tracked in the `project_members` junction table.

```sql
CREATE TABLE projects (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    owner_id    UUID         NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status      VARCHAR(20)  NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'archived')),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    archived_at TIMESTAMPTZ
);

CREATE TABLE project_members (
    project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role       VARCHAR(20) NOT NULL DEFAULT 'member'
               CHECK (role IN ('admin', 'member', 'viewer')),
    joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_id, user_id)
);
```

| Column (projects) | Type         | Constraints                         | Notes                          |
|--------------------|--------------|-------------------------------------|--------------------------------|
| `id`               | UUID         | PK                                  | Immutable                      |
| `name`             | VARCHAR(200) | NOT NULL                            | Displayed in navigation        |
| `description`      | TEXT         | Nullable                            | Markdown-formatted             |
| `owner_id`         | UUID         | FK -> users, NOT NULL               | Project creator                |
| `status`           | VARCHAR(20)  | NOT NULL, CHECK, default `active`   | Active or archived             |
| `created_at`       | TIMESTAMPTZ  | NOT NULL, default `now()`           | Immutable                      |
| `updated_at`       | TIMESTAMPTZ  | NOT NULL, default `now()`           | Updated via trigger            |
| `archived_at`      | TIMESTAMPTZ  | Nullable                            | Set when status -> `archived`  |

| Column (project_members) | Type        | Constraints            | Notes                     |
|--------------------------|-------------|------------------------|---------------------------|
| `project_id`             | UUID        | PK, FK -> projects     | Composite primary key     |
| `user_id`                | UUID        | PK, FK -> users        | Composite primary key     |
| `role`                   | VARCHAR(20) | NOT NULL, default `member` | Project-level permission |
| `joined_at`              | TIMESTAMPTZ | NOT NULL, default `now()` | For audit trail          |

## Comments Table

The `comments` table stores threaded discussion on individual tasks. Comments are soft-deletable via the `deleted_at` column to preserve conversation context.

```sql
CREATE TABLE comments (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id    UUID        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id  UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    body       TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);
```

| Column       | Type        | Constraints                        | Notes                          |
|--------------|-------------|------------------------------------|--------------------------------|
| `id`         | UUID        | PK                                 | Immutable                      |
| `task_id`    | UUID        | FK -> tasks, NOT NULL, ON DELETE CASCADE | Removed with parent task  |
| `author_id`  | UUID        | FK -> users, NOT NULL              | Cannot delete user with comments |
| `body`       | TEXT        | NOT NULL                           | Markdown-formatted             |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()`          | Immutable                      |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default `now()`          | Updated on edit                |
| `deleted_at` | TIMESTAMPTZ | Nullable                           | Soft delete marker             |

Application queries filter on `deleted_at IS NULL` by default. The full comment history is retained for audit purposes.

## Indexes and Performance

All indexes are chosen based on query patterns identified during design review. Each index includes a rationale to guide future maintenance decisions.

```sql
-- Users: lookup by email for login
CREATE UNIQUE INDEX idx_users_email ON users (email);

-- Tasks: list tasks by project, ordered by priority then creation
CREATE INDEX idx_tasks_project_priority ON tasks (project_id, priority, created_at DESC);

-- Tasks: list tasks assigned to a user, filtered by status
CREATE INDEX idx_tasks_assignee_status ON tasks (assignee_id, status)
    WHERE assignee_id IS NOT NULL;

-- Tasks: find tasks due within a date range
CREATE INDEX idx_tasks_due_date ON tasks (due_date)
    WHERE due_date IS NOT NULL AND status NOT IN ('done', 'cancelled');

-- Comments: list comments for a task in chronological order
CREATE INDEX idx_comments_task_created ON comments (task_id, created_at);

-- Project members: list members of a project
CREATE INDEX idx_project_members_user ON project_members (user_id);
```

### Index Rationale

| Index                           | Supports Query                                   | Type       |
|---------------------------------|--------------------------------------------------|------------|
| `idx_users_email`               | Login lookup, duplicate check                    | Unique, B-tree |
| `idx_tasks_project_priority`    | Project task board sorted by priority            | Composite, B-tree |
| `idx_tasks_assignee_status`     | "My Tasks" view filtered by status               | Partial, B-tree |
| `idx_tasks_due_date`            | Calendar view, overdue task queries              | Partial, B-tree |
| `idx_comments_task_created`     | Task detail page comment thread                  | Composite, B-tree |
| `idx_project_members_user`      | "My Projects" lookup                             | B-tree     |

### Query Performance Targets

| Query Pattern                        | Target Latency (p95) | Index Used                      |
|--------------------------------------|----------------------|---------------------------------|
| Login by email                       | < 5 ms               | `idx_users_email`               |
| List project tasks (page of 50)      | < 15 ms              | `idx_tasks_project_priority`    |
| List tasks assigned to user          | < 10 ms              | `idx_tasks_assignee_status`     |
| Load task comments                   | < 10 ms              | `idx_comments_task_created`     |
| Find overdue tasks                   | < 20 ms              | `idx_tasks_due_date`            |

## Migration Strategy

Database schema changes are managed through sequential, versioned migration files stored in `src/db/migrations/`. Each migration is a pair of SQL files for forward and rollback operations.

### File Naming Convention

```
src/db/migrations/
  ├── 001_create_users.up.sql
  ├── 001_create_users.down.sql
  ├── 002_create_projects.up.sql
  ├── 002_create_projects.down.sql
  ├── 003_create_tasks.up.sql
  ├── 003_create_tasks.down.sql
  ├── 004_create_comments.up.sql
  ├── 004_create_comments.down.sql
  └── 005_create_indexes.up.sql
```

### Migration Rules

1. **Forward-only in production**: Rollback migrations exist for development use. Production issues are resolved by creating a new forward migration.
2. **No destructive changes**: Columns are never dropped in the same release they become unused. The deprecation sequence is: (a) stop writing, (b) deploy, (c) stop reading, (d) deploy, (e) drop column in next release.
3. **Idempotent**: All migrations use `IF NOT EXISTS` / `IF EXISTS` guards to allow safe re-runs.
4. **Transaction-wrapped**: Each migration runs inside a single transaction. If any statement fails, the entire migration is rolled back.
5. **Tested**: Migrations are tested in CI by running the full sequence up, then fully down, then fully up again against a fresh database.

### Auto-updated Timestamps

A shared trigger function keeps `updated_at` current across all tables:

```sql
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Applied to each table:
CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_tasks_updated
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_projects_updated
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER trg_comments_updated
    BEFORE UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();
```
