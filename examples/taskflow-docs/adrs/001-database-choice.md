---
title: "ADR-001: Database Technology Selection"
doc_type: adr
---

# ADR-001: Database Technology Selection

## Status

**Accepted** -- 2024-01-20

Supersedes: None
Amended by: None

## Context

TaskFlow requires a persistent data store capable of handling structured task and project data, user accounts, activity logs, and full-text search across task descriptions and comments. The application is expected to serve up to 10,000 concurrent users at launch, with plans to scale to 100,000 within the first year.

Key data characteristics:

- **Relational by nature**: Tasks belong to projects, projects belong to workspaces, users have roles within workspaces. These relationships are core to the domain model.
- **JSON flexibility needed**: Custom fields on tasks and workflow configuration require semi-structured storage.
- **Search requirements**: Users need to search across task titles, descriptions, comments, and custom field values with ranking and highlighting.
- **Audit trail**: Every mutation to a task must be recorded in an append-only activity log for compliance.
- **Transactional integrity**: Operations such as moving a task between columns, updating assignees, and logging the activity must be atomic.

The team evaluated three database technologies to determine the best fit for these requirements.

## Decision Drivers

1. **ACID compliance** -- Financial and compliance customers require strong transactional guarantees.
2. **JSON support** -- Custom fields and workflow definitions are stored as JSON documents.
3. **Full-text search** -- Reducing infrastructure complexity by avoiding a separate search engine if possible.
4. **Ecosystem maturity** -- Availability of ORMs, migration tools, managed hosting, and community knowledge.
5. **Operational cost** -- Managed hosting pricing at projected scale.
6. **Team expertise** -- Current team has strongest experience with relational databases.

## Considered Options

| Criteria              | PostgreSQL          | MongoDB             | MySQL               |
|-----------------------|---------------------|----------------------|----------------------|
| ACID compliance       | Full                | Per-document only    | Full                 |
| JSON support          | Native (jsonb)      | Native (BSON)        | Limited (JSON type)  |
| Full-text search      | Built-in (tsvector) | Atlas Search add-on  | Built-in (limited)   |
| Ecosystem maturity    | Excellent           | Good                 | Excellent            |
| Operational cost      | Moderate            | Higher at scale      | Low                  |
| Team expertise        | Strong              | Limited              | Moderate             |
| Multi-table transactions | Native           | Multi-doc (4.0+)     | Native               |
| Horizontal scaling    | Read replicas + Citus | Native sharding   | Read replicas + Vitess |
| Schema evolution      | Migrations + jsonb  | Schema-less          | Migrations           |
| Geospatial support    | PostGIS             | Native               | Limited              |

### Option 1: PostgreSQL

PostgreSQL provides the strongest combination of relational integrity and JSON flexibility through its `jsonb` column type. Built-in full-text search via `tsvector` and `tsquery` eliminates the need for a separate Elasticsearch cluster at initial scale. Extensions like `pg_trgm` add fuzzy matching capability. The `jsonb` GIN index supports containment queries (`@>`), existence checks (`?`), and path queries, making it suitable for querying arbitrary custom field structures.

PostgreSQL also has a rich extension ecosystem: PostGIS for geospatial data, `pg_cron` for scheduled jobs, `pgvector` for vector similarity search, and `pg_stat_statements` for query performance analysis. Managed hosting is available from all major cloud providers (AWS RDS, Google Cloud SQL, Azure Database).

### Option 2: MongoDB

MongoDB offers native document storage which aligns well with the semi-structured custom fields requirement. However, multi-document transactions only became stable in version 4.0 and carry performance overhead. Atlas Search provides full-text capability but adds cost and operational complexity. The aggregation pipeline is powerful but has a steeper learning curve compared to SQL.

Operational concerns include replica set management, WiredTiger cache sizing, and the need to carefully design shard keys for horizontal scaling. MongoDB Atlas simplifies operations but locks the team into a specific vendor at a premium price point.

### Option 3: MySQL

MySQL is a mature and cost-effective option with strong tooling. However, its JSON support is less performant than PostgreSQL's `jsonb`, and its full-text search capabilities are limited compared to PostgreSQL's `tsvector` implementation. The lack of native `jsonb`-style indexing makes querying custom fields less efficient.

MySQL 8.0 introduced improvements such as window functions, CTEs, and improved JSON functions, but these features still lag behind PostgreSQL in flexibility. The InnoDB storage engine provides strong ACID compliance but the JSON column type stores data as text internally, requiring full-document parsing for queries.

## Decision Outcome

**Chosen option: PostgreSQL**, because it provides the best balance of relational integrity, JSON flexibility, and built-in full-text search. The `jsonb` column type allows efficient storage and querying of custom task fields without sacrificing ACID guarantees. Built-in full-text search reduces infrastructure complexity at launch.

The decision was made with the following configuration plan:

- **Primary**: PostgreSQL 16 on AWS RDS with Multi-AZ deployment
- **Connection pooling**: PgBouncer with transaction-level pooling
- **Full-text search**: Native `tsvector` with GIN indexes; migrate to Elasticsearch if search requirements exceed PostgreSQL capabilities
- **JSON storage**: `jsonb` columns for custom fields, workflow definitions, and notification preferences
- **Backup strategy**: Automated daily snapshots with 30-day retention and point-in-time recovery

## Consequences

### Positive

- **Single database** for relational data, JSON documents, and full-text search reduces operational overhead.
- **Strong ACID guarantees** simplify application-level error handling for multi-step operations.
- **jsonb indexing** enables efficient queries on custom field values without schema changes.
- **Mature migration tooling** (e.g., Prisma Migrate, golang-migrate) supports CI/CD pipeline integration.
- **Team expertise** reduces ramp-up time and lowers the risk of operational mistakes.
- **Cost predictability** with RDS pricing model compared to MongoDB Atlas consumption-based pricing.

### Negative

- **Vertical scaling limits** may require introducing read replicas or Citus extension if write throughput exceeds single-node capacity.
- **Full-text search limitations** compared to dedicated search engines; may need Elasticsearch migration for advanced features like fuzzy matching across languages.
- **Schema migrations required** for structural changes, unlike MongoDB's schema-less approach.
- **Connection management** requires careful tuning of PgBouncer to avoid connection exhaustion under high concurrency.
- **No native horizontal sharding** may complicate future multi-region deployment strategies.

### Related Documents

- [[designs/database|references]]
