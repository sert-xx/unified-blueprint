---
title: REST API Endpoints
doc_type: api
---

# REST API Endpoints

## Overview

The TaskFlow REST API provides programmatic access to all core resources including tasks, projects, comments, and labels. The API follows RESTful conventions and returns JSON responses for all endpoints.

This document specifies every public endpoint, expected request and response shapes, authentication requirements, and error handling behavior. The API implements the search and filtering capabilities defined in [[specs/search-and-filtering|implements]] and relies on the authentication layer described in [[designs/authentication|depends_on]]. For broader context on how the API fits into the system, see [[designs/architecture|references]].

All endpoints require authentication unless explicitly noted otherwise.

## Base URL and Versioning

The API is versioned through the URL path. The current stable version is `v1`.

```
https://api.taskflow.example.com/v1
```

| Environment   | Base URL                                      |
| ------------- | --------------------------------------------- |
| Production    | `https://api.taskflow.example.com/v1`         |
| Staging       | `https://staging-api.taskflow.example.com/v1` |
| Local dev     | `http://localhost:3000/v1`                     |

Version negotiation rules:

- Requests without a version prefix return `404 Not Found`.
- Deprecated versions return a `Sunset` header with the retirement date.
- Breaking changes are only introduced in new major versions; non-breaking additions (new fields, new endpoints) may appear in the current version without notice.

## Authentication Headers

Every authenticated request must include a Bearer token in the `Authorization` header.

```
Authorization: Bearer <access_token>
```

Tokens are obtained through the OAuth 2.0 flow described in the authentication design document. The API also accepts API keys for server-to-server integrations via a dedicated header:

```
X-API-Key: tkfl_live_abc123def456
```

| Header          | Required | Description                              |
| --------------- | -------- | ---------------------------------------- |
| `Authorization` | Yes*     | Bearer token from OAuth flow             |
| `X-API-Key`     | Yes*     | API key for service accounts             |
| `Content-Type`  | Yes      | Must be `application/json` for requests  |
| `Accept`        | No       | Defaults to `application/json`           |

*Either `Authorization` or `X-API-Key` is required; providing both causes a `400 Bad Request`.

## Tasks CRUD

### List Tasks

Retrieve a paginated list of tasks visible to the authenticated user.

```
GET /v1/tasks
```

**Query Parameters:**

| Parameter    | Type     | Default  | Description                                    |
| ------------ | -------- | -------- | ---------------------------------------------- |
| `project_id` | uuid    | —        | Filter by project                              |
| `status`     | string  | —        | Filter by status: `open`, `in_progress`, `done`, `archived` |
| `assignee_id`| uuid    | —        | Filter by assigned user                        |
| `label_ids`  | string  | —        | Comma-separated label UUIDs                    |
| `q`          | string  | —        | Full-text search query                         |
| `sort`       | string  | `created_at` | Sort field: `created_at`, `updated_at`, `priority`, `due_date` |
| `order`      | string  | `desc`   | Sort direction: `asc` or `desc`                |
| `page`       | integer | 1        | Page number                                    |
| `per_page`   | integer | 25       | Items per page (max 100)                       |

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "title": "Implement user onboarding flow",
      "description": "Design and build the multi-step onboarding wizard.",
      "status": "in_progress",
      "priority": "high",
      "project_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
      "assignee_id": "11223344-5566-7788-99aa-bbccddeeff00",
      "label_ids": ["label-001", "label-002"],
      "due_date": "2025-07-15T00:00:00Z",
      "created_at": "2025-06-01T10:30:00Z",
      "updated_at": "2025-06-10T14:22:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 25,
    "total_pages": 4,
    "total_count": 87
  }
}
```

### Create Task

```
POST /v1/tasks
```

**Request Body:**

```json
{
  "title": "Set up CI/CD pipeline",
  "description": "Configure GitHub Actions for automated testing and deployment.",
  "status": "open",
  "priority": "high",
  "project_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
  "assignee_id": "11223344-5566-7788-99aa-bbccddeeff00",
  "label_ids": ["label-003"],
  "due_date": "2025-08-01T00:00:00Z"
}
```

**Response: `201 Created`**

```json
{
  "data": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "title": "Set up CI/CD pipeline",
    "description": "Configure GitHub Actions for automated testing and deployment.",
    "status": "open",
    "priority": "high",
    "project_id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
    "assignee_id": "11223344-5566-7788-99aa-bbccddeeff00",
    "label_ids": ["label-003"],
    "due_date": "2025-08-01T00:00:00Z",
    "created_at": "2025-06-15T09:00:00Z",
    "updated_at": "2025-06-15T09:00:00Z"
  }
}
```

### Get Task

```
GET /v1/tasks/:id
```

**Response: `200 OK`** returns the full task object as shown above, with an additional `comments_count` field.

### Update Task

```
PATCH /v1/tasks/:id
```

Only include fields that should be changed. Omitted fields are left unchanged.

**Request Body:**

```json
{
  "status": "done",
  "priority": "low"
}
```

**Response: `200 OK`** returns the updated task object.

### Delete Task

```
DELETE /v1/tasks/:id
```

**Response: `204 No Content`** on success. Deleted tasks are soft-deleted and can be restored within 30 days by a workspace admin.

## Projects CRUD

### List Projects

```
GET /v1/projects
```

**Query Parameters:**

| Parameter  | Type    | Default      | Description                          |
| ---------- | ------- | ------------ | ------------------------------------ |
| `status`   | string  | —            | `active`, `archived`                 |
| `owner_id` | uuid    | —            | Filter by project owner              |
| `sort`     | string  | `created_at` | Sort field                           |
| `order`    | string  | `desc`       | `asc` or `desc`                      |
| `page`     | integer | 1            | Page number                          |
| `per_page` | integer | 25           | Items per page (max 100)             |

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "f0e1d2c3-b4a5-6789-0abc-def123456789",
      "name": "Website Redesign",
      "description": "Complete overhaul of the public-facing marketing site.",
      "status": "active",
      "owner_id": "11223344-5566-7788-99aa-bbccddeeff00",
      "task_count": 42,
      "created_at": "2025-05-01T08:00:00Z",
      "updated_at": "2025-06-10T16:45:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 25,
    "total_pages": 1,
    "total_count": 3
  }
}
```

### Create Project

```
POST /v1/projects
```

**Request Body:**

```json
{
  "name": "Mobile App v2",
  "description": "Second major iteration of the TaskFlow mobile application.",
  "status": "active"
}
```

**Response: `201 Created`** returns the created project object.

### Get Project

```
GET /v1/projects/:id
```

**Response: `200 OK`** returns the project object including a nested `members` array with user summaries.

### Update Project

```
PATCH /v1/projects/:id
```

**Request Body:**

```json
{
  "name": "Mobile App v2.1",
  "status": "archived"
}
```

**Response: `200 OK`** returns the updated project object.

### Delete Project

```
DELETE /v1/projects/:id
```

**Response: `204 No Content`**. Deleting a project does not delete its tasks; they become unassigned and remain accessible.

## Comments API

### List Comments for a Task

```
GET /v1/tasks/:task_id/comments
```

**Query Parameters:**

| Parameter  | Type    | Default | Description              |
| ---------- | ------- | ------- | ------------------------ |
| `page`     | integer | 1       | Page number              |
| `per_page` | integer | 50      | Items per page (max 200) |

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "c1d2e3f4-a5b6-7890-cdef-123456789012",
      "task_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "author_id": "11223344-5566-7788-99aa-bbccddeeff00",
      "body": "I've pushed the initial implementation. Ready for review.",
      "created_at": "2025-06-12T11:00:00Z",
      "updated_at": "2025-06-12T11:00:00Z"
    }
  ],
  "meta": {
    "current_page": 1,
    "per_page": 50,
    "total_pages": 1,
    "total_count": 5
  }
}
```

### Create Comment

```
POST /v1/tasks/:task_id/comments
```

**Request Body:**

```json
{
  "body": "Looks good overall. A few minor suggestions on the error handling."
}
```

**Response: `201 Created`** returns the new comment object. Creating a comment triggers a `comment.added` WebSocket event for all subscribers of the parent task.

### Update Comment

```
PATCH /v1/tasks/:task_id/comments/:id
```

Only the comment author can update. Edited comments display an `edited_at` timestamp.

**Request Body:**

```json
{
  "body": "Updated feedback: the error handling approach is fine after the latest commit."
}
```

**Response: `200 OK`**

### Delete Comment

```
DELETE /v1/tasks/:task_id/comments/:id
```

**Response: `204 No Content`**. Only the comment author or a project admin may delete.

## Labels API

### List Labels

```
GET /v1/labels
```

Returns all labels in the workspace.

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "label-001",
      "name": "bug",
      "color": "#e74c3c",
      "description": "Something is not working correctly",
      "task_count": 14
    },
    {
      "id": "label-002",
      "name": "feature",
      "color": "#3498db",
      "description": "New feature request",
      "task_count": 31
    },
    {
      "id": "label-003",
      "name": "infrastructure",
      "color": "#2ecc71",
      "description": "DevOps and infrastructure work",
      "task_count": 8
    }
  ]
}
```

### Create Label

```
POST /v1/labels
```

**Request Body:**

```json
{
  "name": "documentation",
  "color": "#9b59b6",
  "description": "Documentation improvements and additions"
}
```

**Response: `201 Created`** returns the new label object.

### Update Label

```
PATCH /v1/labels/:id
```

**Request Body:**

```json
{
  "color": "#8e44ad"
}
```

**Response: `200 OK`**

### Delete Label

```
DELETE /v1/labels/:id
```

**Response: `204 No Content`**. Deleting a label removes it from all associated tasks.

## Error Response Format

All error responses follow a consistent structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "title",
        "issue": "must not be blank"
      },
      {
        "field": "priority",
        "issue": "must be one of: low, medium, high, critical"
      }
    ]
  }
}
```

**Standard Error Codes:**

| HTTP Status | Error Code              | Description                                  |
| ----------- | ----------------------- | -------------------------------------------- |
| 400         | `bad_request`           | Malformed request syntax                     |
| 400         | `validation_error`      | One or more fields failed validation         |
| 401         | `unauthorized`          | Missing or invalid authentication            |
| 403         | `forbidden`             | Authenticated but insufficient permissions   |
| 404         | `not_found`             | Resource does not exist or is not accessible |
| 409         | `conflict`              | Resource state conflict (e.g., duplicate)    |
| 422         | `unprocessable_entity`  | Semantically invalid request                 |
| 429         | `rate_limit_exceeded`   | Too many requests                            |
| 500         | `internal_server_error` | Unexpected server failure                    |
| 503         | `service_unavailable`   | Temporary maintenance or overload            |

The `details` array is present only for `validation_error` responses.

## Rate Limiting

The API enforces rate limits per authentication principal (user token or API key).

| Tier        | Requests per minute | Burst allowance |
| ----------- | ------------------- | --------------- |
| Free        | 60                  | 10              |
| Pro         | 300                 | 50              |
| Enterprise  | 1200                | 200             |

Rate limit state is communicated through response headers on every request:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1718460120
```

| Header                  | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed in the current window        |
| `X-RateLimit-Remaining` | Requests remaining in the current window              |
| `X-RateLimit-Reset`     | Unix timestamp when the current window resets         |

When the limit is exceeded, the API returns `429 Too Many Requests` with a `Retry-After` header indicating the number of seconds to wait.

```json
{
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Retry after 12 seconds.",
    "retry_after": 12
  }
}
```

## Pagination

All list endpoints return paginated results using page-based pagination.

**Request parameters:**

| Parameter  | Type    | Default | Max | Description      |
| ---------- | ------- | ------- | --- | ---------------- |
| `page`     | integer | 1       | —   | Current page     |
| `per_page` | integer | 25      | 100 | Items per page   |

**Response metadata:**

Every paginated response includes a `meta` object:

```json
{
  "meta": {
    "current_page": 2,
    "per_page": 25,
    "total_pages": 8,
    "total_count": 193
  }
}
```

**Link headers:**

Paginated responses also include RFC 8288 `Link` headers for navigation:

```
Link: <https://api.taskflow.example.com/v1/tasks?page=3&per_page=25>; rel="next",
      <https://api.taskflow.example.com/v1/tasks?page=1&per_page=25>; rel="prev",
      <https://api.taskflow.example.com/v1/tasks?page=8&per_page=25>; rel="last",
      <https://api.taskflow.example.com/v1/tasks?page=1&per_page=25>; rel="first"
```

Clients should prefer `Link` headers for traversing pages rather than constructing URLs manually, as the URL structure may change between API versions.

When requesting a page beyond the available range, the API returns `200 OK` with an empty `data` array and the correct `total_count` in the metadata. It does not return `404`.
