---
title: System Architecture
doc_type: design
source_refs:
  - src/api/router.ts
  - src/services/taskService.ts
  - src/middleware/errorHandler.ts
---

# System Architecture

## Overview

TaskFlow employs a **three-layer architecture** that separates concerns across the API layer, service layer, and data layer. This design enables independent scaling, clear boundaries for testing, and straightforward reasoning about data flow. All external requests enter through the API layer, pass through business logic in the service layer, and reach persistent storage via the data layer.

The system is designed to serve both synchronous REST clients and real-time WebSocket subscribers from a unified codebase, sharing service-layer logic across both communication channels.

Related documents:

- [[designs/database|depends_on]]
- [[api/rest-endpoints|references]]
- [[specs/performance-requirements|references]]

## System Layers

The following diagram illustrates the high-level component layout:

```
┌─────────────────────────────────────────────────────────────┐
│                       Clients                                │
│            (Web App / Mobile App / CLI)                       │
└──────────────┬──────────────────────┬────────────────────────┘
               │ HTTPS                │ WSS
               ▼                      ▼
┌──────────────────────┐  ┌───────────────────────┐
│     REST API Layer   │  │   WebSocket Gateway    │
│  (Express Router)    │  │  (Socket.IO Server)    │
├──────────────────────┤  ├───────────────────────┤
│  - Route definitions │  │  - Connection mgmt    │
│  - Request parsing   │  │  - Event routing      │
│  - Input validation  │  │  - Room management    │
│  - Auth middleware    │  │  - Heartbeat          │
└──────────┬───────────┘  └──────────┬────────────┘
           │                         │
           ▼                         ▼
┌──────────────────────────────────────────────────┐
│                Service Layer                      │
├──────────────────────────────────────────────────┤
│  TaskService   │ ProjectService │ UserService    │
│  AuthService   │ NotifyService  │ SearchService  │
├──────────────────────────────────────────────────┤
│  - Business rules and validation                 │
│  - Transaction orchestration                     │
│  - Event emission                                │
│  - Cache management                              │
└──────────────────────┬───────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│                  Data Layer                       │
├──────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ PostgreSQL │  │  Redis   │  │ File Storage │ │
│  │ (primary)  │  │ (cache)  │  │ (S3-compat)  │ │
│  └────────────┘  └──────────┘  └──────────────┘ │
└──────────────────────────────────────────────────┘
```

## API Layer

The API layer is responsible for accepting external requests, validating input shapes, enforcing authentication, and delegating to the appropriate service. It contains no business logic.

### REST Endpoints

All REST endpoints are defined in `src/api/router.ts` using Express Router. Each route handler follows a consistent pattern:

1. Extract and validate request parameters using `zod` schemas
2. Call the corresponding service method
3. Format the response according to the standard envelope
4. Pass errors to the centralized error handler

```typescript
// Standard response envelope
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ErrorDetail | null;
  meta: {
    requestId: string;
    timestamp: string;
  };
}
```

### WebSocket Gateway

The WebSocket gateway runs on the same HTTP server but handles persistent connections for real-time features. It shares authentication middleware with the REST layer and delegates all event processing to the service layer. See [[designs/realtime-notifications]] for the full specification of the real-time subsystem.

### Middleware Stack

Requests pass through the following middleware chain in order:

| Order | Middleware         | Responsibility                            |
|------:|--------------------|-------------------------------------------|
|     1 | `requestId`        | Generates a unique ID per request         |
|     2 | `cors`             | Enforces CORS policy                      |
|     3 | `rateLimiter`      | Applies per-IP and per-user rate limits   |
|     4 | `bodyParser`       | Parses JSON request bodies                |
|     5 | `authenticate`     | Verifies JWT and attaches user context    |
|     6 | `authorize`        | Checks role-based permissions             |
|     7 | `requestLogger`    | Logs method, path, status, and latency    |

## Service Layer

The service layer encapsulates all business rules. Services are stateless classes that receive dependencies through constructor injection. Each service method operates within an explicit transaction boundary when writes are involved.

### Key Services

**TaskService** (`src/services/taskService.ts`)
- CRUD operations for tasks
- Status transition validation (enforces allowed state machine transitions)
- Assignment logic and workload balancing
- Due date and recurrence rule processing

**ProjectService**
- Project lifecycle management (create, archive, delete)
- Member invitation and role assignment within a project
- Dashboard metric aggregation

**UserService**
- Profile management and preferences
- Activity history tracking
- Account deactivation flow

**AuthService**
- JWT issuance and validation
- OAuth2 provider integration (Google, GitHub)
- Password hashing and verification using Argon2

**NotifyService**
- Dispatches events to the WebSocket gateway
- Queues email and push notifications
- Manages per-user notification preferences

### Service Communication

Services communicate exclusively through method calls. There are no inter-service events within a single process. When a service action triggers a side effect (e.g., creating a task sends a notification), the orchestrating service calls the dependent service directly within the same transaction scope.

```
TaskService.create(data)
  ├── validate(data)
  ├── db.tasks.insert(data)          // Data Layer
  ├── NotifyService.send(event)      // Side effect
  └── return createdTask
```

## Data Layer

The data layer abstracts all persistence operations behind repository interfaces. Concrete implementations are injected at startup, making it straightforward to swap storage backends during testing.

### PostgreSQL (Primary Store)

All relational data lives in PostgreSQL 16. The database schema is managed through versioned migration files in `src/db/migrations/`. See [[designs/database|depends_on]] for the full schema specification.

Connection pooling is handled by `pg-pool` with the following default configuration:

| Parameter       | Value  |
|-----------------|-------:|
| `min`           |      5 |
| `max`           |     20 |
| `idleTimeoutMs` | 30,000 |
| `acquireTimeoutMs` | 10,000 |

### Redis (Cache and Pub/Sub)

Redis serves two purposes:

1. **Caching**: Frequently read data (user profiles, project metadata) is cached with a TTL of 5 minutes. Cache invalidation is performed eagerly on write operations.
2. **Pub/Sub**: The real-time notification system uses Redis Pub/Sub to broadcast events across multiple server instances in a horizontally scaled deployment.

### File Storage

Binary assets (attachments, avatars) are stored in an S3-compatible object store. The data layer exposes a `StorageProvider` interface that can target AWS S3, MinIO, or a local filesystem for development.

## Technology Stack

| Component        | Technology            | Version   |
|------------------|-----------------------|-----------|
| Runtime          | Node.js               | 20 LTS    |
| Language         | TypeScript            | 5.4       |
| HTTP Framework   | Express               | 4.19      |
| WebSocket        | Socket.IO             | 4.7       |
| Database         | PostgreSQL            | 16        |
| Cache / Pub/Sub  | Redis                 | 7.2       |
| ORM / Query      | Kysely                | 0.27      |
| Validation       | Zod                   | 3.23      |
| Auth             | jsonwebtoken + Argon2 | -         |
| Testing          | Vitest + Supertest    | -         |
| File Storage     | AWS SDK v3 (S3)       | 3.x       |

## Error Handling Strategy

Errors are categorized into three tiers, each with a distinct handling path defined in `src/middleware/errorHandler.ts`:

### Tier 1: Client Errors (4xx)

Validation failures, authentication errors, and not-found conditions. These are returned directly to the client with a descriptive message and the appropriate HTTP status code.

```
Client Request
  → Middleware / Service throws AppError(code, message)
    → errorHandler catches AppError
      → Responds with { success: false, error: { code, message } }
```

### Tier 2: Upstream Failures (502 / 503)

Failures from external dependencies (database timeouts, third-party API errors). The error handler logs the full stack trace, increments a failure counter, and returns a generic error to the client.

### Tier 3: Unexpected Errors (500)

Unhandled exceptions that indicate a bug. The error handler logs the error with full context, triggers an alert via the monitoring integration, and returns a generic internal error response. In production, no stack trace is exposed to the client.

```
┌──────────┐     ┌──────────────────┐     ┌──────────────┐
│  Thrown   │────►│  errorHandler.ts │────►│   Response   │
│  Error    │     │                  │     │              │
└──────────┘     │  1. Classify     │     │  4xx / 5xx   │
                 │  2. Log          │     │  + envelope  │
                 │  3. Metric       │     └──────────────┘
                 │  4. Respond      │
                 └──────────────────┘
```

## Scalability Considerations

### Horizontal Scaling

The application is designed to run as multiple stateless processes behind a load balancer. Session state is stored in Redis, and all file uploads target external object storage, so any instance can handle any request.

```
                    ┌────────────┐
                    │   Nginx    │
                    │   (LB)    │
                    └─────┬──────┘
              ┌───────────┼───────────┐
              ▼           ▼           ▼
         ┌────────┐  ┌────────┐  ┌────────┐
         │ App 1  │  │ App 2  │  │ App 3  │
         └───┬────┘  └───┬────┘  └───┬────┘
             │           │           │
             ▼           ▼           ▼
        ┌─────────────────────────────────┐
        │   Shared PostgreSQL + Redis     │
        └─────────────────────────────────┘
```

### Scaling Thresholds

The following thresholds trigger auto-scaling rules:

| Metric              | Scale-up Threshold | Scale-down Threshold |
|---------------------|--------------------|----------------------|
| CPU utilization     | > 70% for 3 min   | < 30% for 10 min     |
| Memory utilization  | > 80% for 3 min   | < 40% for 10 min     |
| Request queue depth | > 100 pending      | < 10 pending          |
| WebSocket connections | > 5,000 per instance | < 1,000 per instance |

### Database Scaling

PostgreSQL read replicas can be introduced behind a read/write splitting proxy. The data layer repository interface accepts a `readonly` flag that routes queries to the appropriate connection pool. Write operations always target the primary.

### Cache Warming

On cold start, critical cache entries (active project metadata, frequently accessed user profiles) are preloaded from the database. This reduces the latency spike that would otherwise occur when a new instance begins receiving traffic.
