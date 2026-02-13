---
title: Task Search and Filtering Specification
doc_type: spec
---

# Task Search and Filtering Specification

## Overview

TaskFlow provides a powerful search and filtering engine that allows users to locate tasks quickly across projects, teams, and time ranges. The search system combines full-text search over task titles, descriptions, and comments with structured filtering on metadata fields such as status, assignee, priority, labels, and date ranges.

All search and filter operations are exposed through the `GET /api/v1/tasks/search` endpoint and share a unified query syntax. The underlying implementation depends on the database schema and indexing strategy defined in [[designs/database|depends_on]].

The search system is designed to handle workspaces containing up to 500,000 tasks with sub-second response times for typical queries.

## Full-Text Search

Full-text search operates on the following fields with configurable weighting:

| Field             | Weight | Indexed | Notes                              |
|-------------------|--------|---------|------------------------------------|
| `title`           | 3.0    | Yes     | Highest relevance boost            |
| `description`     | 1.0    | Yes     | Markdown content, stripped of tags |
| `comment_body`    | 0.5    | Yes     | All comments on the task           |
| `label_name`      | 2.0    | Yes     | Exact and prefix match supported   |
| `custom_field`    | 0.3    | Yes     | User-defined fields                |

### Search Syntax

- **Simple terms**: `deploy server` matches tasks containing both words in any indexed field.
- **Phrase match**: `"database migration"` matches the exact phrase.
- **Prefix match**: `deploy*` matches any word starting with `deploy`.
- **Exclusion**: `-blocked` excludes tasks containing the word `blocked`.
- **Field-scoped search**: `title:deployment` restricts the search to the title field only.

The search engine uses language-aware stemming for English text. Stemming can be disabled per query by passing `stemming=false`.

### Ranking Algorithm

Results are ranked using BM25 with the following parameters:

- `k1 = 1.2` (term frequency saturation)
- `b = 0.75` (document length normalization)

When a query includes both full-text search and structured filters, the final score is computed as:

```
final_score = bm25_score * relevance_weight + recency_boost
```

Where `recency_boost` applies a decay factor based on the task's `updated_at` timestamp. Tasks updated within the last 24 hours receive a 10% boost, decaying linearly to zero over 30 days.

## Filter Parameters

All filter parameters are passed as query string parameters and can be combined freely. Multiple values for the same parameter are treated as OR conditions; different parameters are combined with AND logic.

### Status Filter

| Parameter  | Type     | Values                                         | Default |
|------------|----------|-------------------------------------------------|---------|
| `status`   | string[] | `open`, `in_progress`, `in_review`, `done`, `closed`, `archived` | all     |

- Multiple statuses can be provided: `status=open&status=in_progress`.
- The special value `active` is an alias for `open,in_progress,in_review`.
- The special value `completed` is an alias for `done,closed`.

### Assignee Filter

| Parameter     | Type     | Description                          |
|---------------|----------|--------------------------------------|
| `assignee`    | string[] | User IDs of assigned users           |
| `unassigned`  | boolean  | If `true`, return only unassigned tasks |

- `assignee` and `unassigned=true` are mutually exclusive. If both are provided, the API returns a 400 error.
- `assignee=me` is a shorthand that resolves to the authenticated user's ID.

### Priority Filter

| Parameter  | Type     | Values                                      |
|------------|----------|---------------------------------------------|
| `priority` | string[] | `critical`, `high`, `medium`, `low`, `none` |

Priority values are ordered. When using comparison operators in the advanced query syntax, `critical` is the highest and `none` is the lowest.

### Date Range Filters

| Parameter          | Type   | Format       | Description                     |
|--------------------|--------|--------------|---------------------------------|
| `created_after`    | string | ISO 8601     | Tasks created on or after date  |
| `created_before`   | string | ISO 8601     | Tasks created on or before date |
| `updated_after`    | string | ISO 8601     | Tasks updated on or after date  |
| `updated_before`   | string | ISO 8601     | Tasks updated on or before date |
| `due_after`        | string | ISO 8601     | Tasks due on or after date      |
| `due_before`       | string | ISO 8601     | Tasks due on or before date     |

All date-time values are interpreted as UTC unless an explicit timezone offset is provided.

### Label Filter

| Parameter  | Type     | Description                               |
|------------|----------|-------------------------------------------|
| `label`    | string[] | Label slugs to filter by                  |
| `label_op` | string   | `and` or `or` (default: `or`)             |

- `label=bug&label=urgent&label_op=and` returns tasks that have both the `bug` and `urgent` labels.
- Label slugs are case-insensitive and normalized to lowercase.

### Project and Team Filters

| Parameter    | Type     | Description                    |
|--------------|----------|--------------------------------|
| `project_id` | string[] | Filter by project              |
| `team_id`    | string[] | Filter by team                 |
| `parent_id`  | string   | Filter by parent task (subtasks) |

## Sort Options

Results can be sorted by any of the following keys. The default sort is `relevance` when a search query is present, or `updated_at` descending otherwise.

| Sort Key       | Description                        | Default Direction |
|----------------|------------------------------------|-------------------|
| `relevance`    | BM25 search score                  | desc              |
| `created_at`   | Task creation timestamp            | desc              |
| `updated_at`   | Last modification timestamp        | desc              |
| `due_date`     | Task due date (nulls last)         | asc               |
| `priority`     | Priority level                     | desc (critical first) |
| `title`        | Alphabetical by title              | asc               |
| `status`       | Status ordinal value               | asc               |

Sort direction can be overridden with the `sort_dir` parameter: `sort=due_date&sort_dir=desc`.

Multiple sort keys are supported with comma separation: `sort=priority,due_date` sorts first by priority descending, then by due date ascending for tasks with the same priority.

## Pagination

The search API uses cursor-based pagination to ensure stable results even when the underlying dataset changes between requests.

### Parameters

| Parameter  | Type   | Default | Max  | Description                        |
|------------|--------|---------|------|------------------------------------|
| `limit`    | int    | 25      | 100  | Number of results per page         |
| `cursor`   | string | —       | —    | Opaque cursor from previous response |

### Response Envelope

```json
{
  "data": [...],
  "pagination": {
    "next_cursor": "eyJpZCI6MTAwLCJzY29yZSI6MC44NX0=",
    "prev_cursor": "eyJpZCI6MSwic2NvcmUiOjEuMH0=",
    "has_more": true,
    "total_estimate": 1342
  }
}
```

- `next_cursor` and `prev_cursor` are base64-encoded JSON objects containing the sort key values of the boundary items.
- `total_estimate` is an approximate count computed using `EXPLAIN` statistics rather than a full `COUNT(*)` for performance reasons. Exact counts are available via the `/count` endpoint.
- Cursors expire after 15 minutes of inactivity. Expired cursors return a 410 Gone response, and the client must restart pagination.

## Faceted Counts

When the `facets` parameter is included, the response contains aggregated counts for the specified dimensions alongside the search results.

### Supported Facets

| Facet        | Description                              |
|--------------|------------------------------------------|
| `status`     | Count of tasks per status value          |
| `priority`   | Count of tasks per priority level        |
| `assignee`   | Count of tasks per assignee (top 20)     |
| `label`      | Count of tasks per label (top 30)        |
| `project`    | Count of tasks per project               |

### Facet Response Format

```json
{
  "facets": {
    "status": [
      { "value": "open", "count": 234 },
      { "value": "in_progress", "count": 89 },
      { "value": "done", "count": 1019 }
    ],
    "priority": [
      { "value": "critical", "count": 12 },
      { "value": "high", "count": 67 },
      { "value": "medium", "count": 198 },
      { "value": "low", "count": 65 }
    ]
  }
}
```

Facet counts are computed against the filtered result set (post-filter), not the entire dataset. This means facet counts reflect how many results match the current filters for each facet value.

For performance, facet computation uses approximate counts when the result set exceeds 50,000 tasks. The `facet_exact=true` parameter forces exact counting at the cost of higher latency.

## Query Examples

### Find open high-priority bugs assigned to a specific user

```
GET /api/v1/tasks/search?q=bug&status=open&priority=high&assignee=usr_a1b2c3
```

Expected: Returns open tasks matching "bug" in any text field, with high priority, assigned to user `usr_a1b2c3`. Results sorted by relevance.

### Find overdue tasks across all projects

```
GET /api/v1/tasks/search?status=open&status=in_progress&due_before=2025-01-15T00:00:00Z&sort=due_date&sort_dir=asc
```

Expected: Returns all open or in-progress tasks with a due date before January 15, 2025, sorted by due date ascending (most overdue first).

### Search with phrase matching and label intersection

```
GET /api/v1/tasks/search?q="database migration"&label=backend&label=infrastructure&label_op=and&limit=10
```

Expected: Returns up to 10 tasks containing the exact phrase "database migration" that have both the `backend` and `infrastructure` labels.

### Paginated results with facets

```
GET /api/v1/tasks/search?q=deploy&facets=status,priority&limit=25
```

Expected: Returns the first 25 tasks matching "deploy", along with faceted counts grouped by status and priority. The response includes a `next_cursor` for fetching subsequent pages.

### Find recently updated unassigned tasks in a specific project

```
GET /api/v1/tasks/search?project_id=proj_x9y8z7&unassigned=true&updated_after=2025-01-01T00:00:00Z&sort=updated_at
```

Expected: Returns unassigned tasks in the specified project that were updated after January 1, 2025, sorted by most recently updated first.
