---
title: Performance Requirements
doc_type: spec
---

# Performance Requirements

## Overview

This document defines the performance targets, throughput requirements, and monitoring standards for the TaskFlow platform. All services must meet these requirements under normal operating conditions (defined as traffic within the 90th percentile of historical daily patterns).

Performance targets are validated against the database schema and query patterns described in [[designs/database|references]] and the endpoint contracts defined in [[api/rest-endpoints|references]].

Load testing is conducted weekly against a staging environment seeded with a representative dataset of 500,000 tasks, 10,000 users, and 50 projects.

## Latency Targets

Latency is measured at the application boundary (after TLS termination, before response serialization) using histogram metrics. All values represent server-side processing time excluding network transfer.

### API Endpoint Latency

| Endpoint Category      | P50    | P95    | P99    | Max Acceptable |
|------------------------|--------|--------|--------|----------------|
| Task CRUD (single)     | 15 ms  | 50 ms  | 120 ms | 500 ms         |
| Task list (paginated)  | 30 ms  | 100 ms | 250 ms | 800 ms         |
| Full-text search       | 50 ms  | 150 ms | 400 ms | 1,200 ms       |
| Faceted search         | 80 ms  | 250 ms | 600 ms | 2,000 ms       |
| Batch operations       | 100 ms | 300 ms | 800 ms | 3,000 ms       |
| Authentication         | 10 ms  | 30 ms  | 80 ms  | 300 ms         |
| File upload (< 5 MB)   | 200 ms | 500 ms | 1,000 ms | 5,000 ms     |
| Webhook delivery       | —      | —      | —      | 5,000 ms       |

### WebSocket Latency

| Event Type              | Target Latency | Max Acceptable |
|-------------------------|----------------|----------------|
| Task status change      | 50 ms          | 200 ms         |
| Comment added           | 80 ms          | 300 ms         |
| Assignment change       | 50 ms          | 200 ms         |
| Bulk update broadcast   | 150 ms         | 500 ms         |

WebSocket latency is measured from the moment the database transaction commits to the moment the event is delivered to all subscribed clients on the same server instance. Cross-instance delivery via the message bus adds an additional 10-30 ms.

## Throughput Requirements

### Sustained Load Targets

| Metric                          | Target           | Burst (10 sec window) |
|---------------------------------|------------------|-----------------------|
| API requests per second         | 2,000 rps        | 5,000 rps             |
| Concurrent WebSocket connections| 20,000           | 25,000                |
| Search queries per second       | 500 qps          | 1,200 qps             |
| Webhook deliveries per minute   | 10,000           | 30,000                |
| Background job throughput       | 1,000 jobs/min   | 3,000 jobs/min        |

### Rate Limiting

Per-user rate limits are enforced using a sliding window algorithm:

| Tier        | Requests/min | Search queries/min | Batch ops/min |
|-------------|-------------|-------------------|---------------|
| Free        | 60          | 20                | 5             |
| Pro         | 300         | 100               | 30            |
| Enterprise  | 1,200       | 500               | 120           |
| API (token) | 600         | 200               | 60            |

Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response. Requests exceeding the limit receive a 429 Too Many Requests response with a `Retry-After` header.

## Database Performance

### Query Execution Constraints

All database queries executed in the request path must adhere to the following constraints:

| Constraint                          | Limit          |
|-------------------------------------|----------------|
| Maximum query execution time        | 200 ms         |
| Maximum rows scanned per query      | 100,000        |
| Maximum joins per query             | 4              |
| Maximum result set size             | 10,000 rows    |
| Connection pool size per instance   | 20             |
| Connection acquisition timeout      | 500 ms         |

Queries exceeding 200 ms are logged as slow queries and trigger an alert if they occur more than 10 times per minute.

### Index Requirements

- All foreign key columns must be indexed.
- Composite indexes must be created for commonly used filter combinations: `(project_id, status, updated_at)` and `(assignee_id, status, priority)`.
- Full-text search indexes must be maintained using GIN indexes on the `tsvector` column.
- Index bloat must not exceed 30% of the index size. Automated `REINDEX` runs weekly during the maintenance window.

### Connection Pool Configuration

| Parameter               | Value    |
|-------------------------|----------|
| Min idle connections    | 5        |
| Max connections         | 20       |
| Idle timeout            | 300 sec  |
| Max lifetime            | 1,800 sec|
| Validation interval     | 30 sec   |

## API Response Budgets

Each API request has a total time budget allocated across processing stages. If any stage exceeds its budget, the request proceeds but the overage is logged for investigation.

### Single Task Retrieval Budget (50 ms target)

| Stage                    | Budget  | Percentage |
|--------------------------|---------|------------|
| Authentication/AuthZ     | 5 ms    | 10%        |
| Request parsing          | 2 ms    | 4%         |
| Database query           | 25 ms   | 50%        |
| Business logic           | 8 ms    | 16%        |
| Response serialization   | 5 ms    | 10%        |
| Middleware overhead       | 5 ms    | 10%        |

### Search Request Budget (150 ms target)

| Stage                    | Budget  | Percentage |
|--------------------------|---------|------------|
| Authentication/AuthZ     | 5 ms    | 3%         |
| Query parsing/planning   | 10 ms   | 7%         |
| Full-text search         | 60 ms   | 40%        |
| Filter application       | 30 ms   | 20%        |
| Facet computation        | 25 ms   | 17%        |
| Response serialization   | 10 ms   | 7%         |
| Middleware overhead       | 10 ms   | 6%         |

### Batch Operation Budget (300 ms target)

| Stage                    | Budget  | Percentage |
|--------------------------|---------|------------|
| Authentication/AuthZ     | 5 ms    | 2%         |
| Request validation       | 10 ms   | 3%         |
| Database transaction     | 200 ms  | 67%        |
| Event emission           | 50 ms   | 17%        |
| Response serialization   | 15 ms   | 5%         |
| Middleware overhead       | 20 ms   | 6%         |

## Monitoring and Alerting

### Prometheus Metrics

The following metrics are exposed at the `/metrics` endpoint in Prometheus format:

| Metric Name                              | Type      | Labels                          | Description                          |
|------------------------------------------|-----------|---------------------------------|--------------------------------------|
| `taskflow_http_request_duration_seconds`  | Histogram | method, path, status            | Request latency distribution         |
| `taskflow_http_requests_total`            | Counter   | method, path, status            | Total request count                  |
| `taskflow_db_query_duration_seconds`      | Histogram | query_type, table               | Database query latency               |
| `taskflow_db_connections_active`          | Gauge     | pool_name                       | Active database connections          |
| `taskflow_db_connections_idle`            | Gauge     | pool_name                       | Idle database connections            |
| `taskflow_search_query_duration_seconds`  | Histogram | query_type, has_facets          | Search-specific latency              |
| `taskflow_websocket_connections_active`   | Gauge     | —                               | Current WebSocket connections        |
| `taskflow_websocket_messages_total`       | Counter   | event_type, direction           | WebSocket message count              |
| `taskflow_background_jobs_duration_seconds`| Histogram | job_type, status               | Background job execution time        |
| `taskflow_background_jobs_total`          | Counter   | job_type, status                | Total background jobs processed      |
| `taskflow_rate_limit_rejections_total`    | Counter   | tier, endpoint_category         | Rate-limited request count           |
| `taskflow_cache_hit_ratio`               | Gauge     | cache_name                      | Cache hit rate                       |

### Alert Rules

| Alert Name                    | Condition                                              | Severity | Action                        |
|-------------------------------|--------------------------------------------------------|----------|-------------------------------|
| HighP99Latency                | P99 latency > 2x target for 5 min                     | Warning  | Page on-call engineer         |
| CriticalP99Latency            | P99 latency > 5x target for 2 min                     | Critical | Page on-call, notify lead     |
| ErrorRateHigh                 | 5xx rate > 1% of total requests for 5 min              | Warning  | Page on-call engineer         |
| ErrorRateCritical             | 5xx rate > 5% of total requests for 2 min              | Critical | Page on-call, trigger rollback|
| DatabaseConnectionExhaustion  | Active connections > 90% pool size for 3 min           | Warning  | Scale connection pool         |
| SlowQuerySpike                | Slow queries > 50/min for 5 min                        | Warning  | Investigate query plans        |
| WebSocketConnectionDrop       | Connections drop > 20% in 1 min                        | Critical | Check load balancer health    |
| SearchLatencyDegradation      | Search P95 > 500 ms for 10 min                        | Warning  | Check index health            |

## SLA Definition

### Availability

| Tier        | Monthly Uptime | Allowed Downtime | Measurement              |
|-------------|----------------|------------------|--------------------------|
| Free        | 99.0%          | 7 hr 18 min      | Synthetic health checks  |
| Pro         | 99.9%          | 43 min 50 sec    | Synthetic health checks  |
| Enterprise  | 99.95%         | 21 min 55 sec    | Synthetic health checks  |

Uptime is measured by synthetic health check probes running every 30 seconds from three geographic regions. A service is considered down when more than 50% of probes fail for two consecutive intervals.

### Performance SLA

The performance SLA guarantees that the latency targets defined in this document are met for 99% of requests during any calendar month. Violations are calculated as:

```
violation_ratio = count(requests exceeding P99 target) / count(total requests)
```

If `violation_ratio` exceeds 1% in a calendar month, affected Enterprise customers are eligible for service credits according to the following schedule:

| Violation Ratio | Credit Percentage |
|-----------------|-------------------|
| 1% - 2%        | 10%               |
| 2% - 5%        | 25%               |
| > 5%           | 50%               |

### Exclusions

The following are excluded from SLA calculations:

- Scheduled maintenance windows (announced 72 hours in advance)
- Force majeure events
- Client-side errors (4xx responses)
- Requests exceeding rate limits
- Beta or preview features explicitly marked as non-SLA
