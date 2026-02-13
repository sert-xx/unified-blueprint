---
title: Deployment Guide
doc_type: guide
---

# Deployment Guide

## Overview

This guide covers the deployment process for the TaskFlow application in production and staging environments. TaskFlow is deployed as a set of containerized services orchestrated with Docker Compose, with support for horizontal scaling behind a load balancer.

The deployment architecture follows the patterns described in [[designs/architecture|references]] and is designed to meet the targets outlined in [[specs/performance-requirements|references]].

## Prerequisites

Before deploying TaskFlow, ensure the following tools and services are available on the target host:

| Tool            | Minimum Version | Purpose                          |
| --------------- | --------------- | -------------------------------- |
| Docker          | 24.0+           | Container runtime                |
| Docker Compose  | 2.20+           | Multi-container orchestration    |
| OpenSSL         | 3.0+            | TLS certificate generation       |
| curl            | 7.80+           | Health check verification        |
| PostgreSQL CLI  | 15+             | Database migration (optional)    |

The target host should have at least 2 CPU cores, 4 GB of RAM, and 20 GB of available disk space. For production workloads handling more than 500 concurrent users, allocate 4 CPU cores and 8 GB of RAM.

## Docker Compose Setup

Create a `docker-compose.yml` file in the project root directory:

```yaml
version: "3.9"

services:
  app:
    image: taskflow/api:latest
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "${APP_PORT:-3000}:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - LOG_LEVEL=${LOG_LEVEL:-info}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  db:
    image: postgres:15-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=${DB_NAME}
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER} -d ${DB_NAME}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data
    restart: unless-stopped

  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/certs:/etc/nginx/certs:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
```

Start the services with:

```bash
docker compose up -d
```

To rebuild after code changes:

```bash
docker compose build app && docker compose up -d app
```

## Environment Variables

All configuration is managed through environment variables. Create a `.env` file in the project root directory with the following values:

| Variable            | Type    | Default       | Description                                          |
| ------------------- | ------- | ------------- | ---------------------------------------------------- |
| `NODE_ENV`          | string  | `development` | Runtime environment (`development`, `production`)    |
| `APP_PORT`          | number  | `3000`        | Port the application listens on                      |
| `DATABASE_URL`      | string  | —             | PostgreSQL connection string                         |
| `DB_USER`           | string  | `taskflow`    | PostgreSQL username                                  |
| `DB_PASSWORD`       | string  | —             | PostgreSQL password (required)                       |
| `DB_NAME`           | string  | `taskflow`    | PostgreSQL database name                             |
| `REDIS_URL`         | string  | —             | Redis connection string for caching and sessions     |
| `JWT_SECRET`        | string  | —             | Secret key for signing JSON Web Tokens (required)    |
| `JWT_EXPIRY`        | string  | `24h`         | Token expiration duration                            |
| `LOG_LEVEL`         | string  | `info`        | Logging verbosity (`debug`, `info`, `warn`, `error`) |
| `CORS_ORIGINS`      | string  | `*`           | Comma-separated list of allowed CORS origins         |
| `RATE_LIMIT_WINDOW` | number  | `900000`      | Rate limit window in milliseconds (15 minutes)       |
| `RATE_LIMIT_MAX`    | number  | `100`         | Maximum requests per rate limit window               |
| `SMTP_HOST`         | string  | —             | SMTP server for email notifications                  |
| `SMTP_PORT`         | number  | `587`         | SMTP port                                            |
| `SMTP_USER`         | string  | —             | SMTP authentication username                         |
| `SMTP_PASSWORD`     | string  | —             | SMTP authentication password                         |

Variables without a default value are required and must be set before starting the application. Use strong, randomly generated values for `JWT_SECRET` and `DB_PASSWORD`.

## Database Migration

TaskFlow uses a migration-based schema management approach. Migrations run automatically on application startup when `NODE_ENV` is set to `production`. To run migrations manually:

```bash
# Run all pending migrations
docker compose exec app npm run migrate:up

# Check current migration status
docker compose exec app npm run migrate:status

# Roll back the most recent migration
docker compose exec app npm run migrate:down
```

Before deploying a new version that includes schema changes, always back up the database:

```bash
docker compose exec db pg_dump -U ${DB_USER} ${DB_NAME} > backup_$(date +%Y%m%d_%H%M%S).sql
```

To restore from a backup:

```bash
cat backup_file.sql | docker compose exec -T db psql -U ${DB_USER} ${DB_NAME}
```

## Health Check Endpoints

TaskFlow exposes the following health check endpoints for monitoring and orchestration:

| Endpoint        | Method | Description                                  | Success Code |
| --------------- | ------ | -------------------------------------------- | ------------ |
| `/health`       | GET    | Basic liveness check                         | 200          |
| `/health/ready` | GET    | Readiness check (includes DB and Redis)      | 200          |
| `/health/live`  | GET    | Liveness probe for Kubernetes compatibility  | 200          |

The `/health/ready` endpoint returns a JSON response with the status of each dependency:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "services": {
    "database": { "status": "ok", "latency_ms": 2 },
    "redis": { "status": "ok", "latency_ms": 1 },
    "migrations": { "status": "ok", "version": "20250115_001" }
  }
}
```

If any dependency is unavailable, the endpoint returns a 503 status code with the failing service marked as `"degraded"` or `"down"`.

## SSL/TLS Configuration

For production deployments, configure TLS termination at the Nginx reverse proxy. Create the Nginx configuration file at `nginx/nginx.conf`:

```nginx
upstream taskflow_api {
    server app:3000;
}

server {
    listen 80;
    server_name taskflow.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name taskflow.example.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;

    location / {
        proxy_pass http://taskflow_api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Place your TLS certificate files in the `nginx/certs/` directory. For Let's Encrypt certificates, use certbot with the standalone or webroot plugin.

## Monitoring Setup

TaskFlow integrates with Prometheus for metrics collection and Grafana for visualization. Add the following services to your `docker-compose.yml`:

```yaml
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - promdata:/prometheus
    ports:
      - "9090:9090"
    restart: unless-stopped

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafanadata:/var/lib/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
    restart: unless-stopped
```

Create the Prometheus configuration at `monitoring/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "taskflow-api"
    static_configs:
      - targets: ["app:3000"]
    metrics_path: "/metrics"
    scrape_interval: 10s
```

The application exposes the following key metrics at the `/metrics` endpoint:

| Metric                              | Type      | Description                         |
| ----------------------------------- | --------- | ----------------------------------- |
| `taskflow_http_requests_total`      | Counter   | Total HTTP requests by method/path  |
| `taskflow_http_duration_seconds`    | Histogram | Request duration distribution       |
| `taskflow_active_connections`       | Gauge     | Current active connections          |
| `taskflow_db_query_duration_seconds`| Histogram | Database query execution time       |
| `taskflow_tasks_created_total`      | Counter   | Total tasks created                 |
| `taskflow_tasks_completed_total`    | Counter   | Total tasks marked as completed     |

After starting the monitoring stack, access Grafana at `http://localhost:3001`, add Prometheus as a data source pointing to `http://prometheus:9090`, and import the TaskFlow dashboard from `monitoring/grafana-dashboard.json`.
