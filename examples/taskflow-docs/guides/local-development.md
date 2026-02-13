---
title: Local Development Setup
doc_type: guide
---

# Local Development Setup

## Overview

This guide walks through setting up the TaskFlow application for local development. By the end of this guide, you will have a fully working development environment with hot-reload, a local database, and the ability to run the full test suite.

For production deployment instructions, see [[guides/deployment|references]]. For details on the database schema and data model, see [[designs/database|references]].

## Prerequisites

Ensure the following tools are installed on your development machine:

| Tool       | Minimum Version | Installation                          |
| ---------- | --------------- | ------------------------------------- |
| Node.js    | 20.0+           | https://nodejs.org or use nvm         |
| npm        | 10.0+           | Included with Node.js                 |
| PostgreSQL | 15+             | https://www.postgresql.org/download/  |
| Redis      | 7.0+            | https://redis.io/download             |
| Git        | 2.40+           | https://git-scm.com                   |

Optional but recommended:

| Tool             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| Docker Desktop   | Run PostgreSQL and Redis in containers    |
| nvm              | Manage multiple Node.js versions          |
| pgAdmin or DBeaver | Visual database management              |
| Postman or httpie  | API testing                             |

## Repository Setup

Clone the repository and install dependencies:

```bash
git clone https://github.com/example/taskflow.git
cd taskflow
npm install
```

Copy the example environment file and configure it for local development:

```bash
cp .env.example .env
```

Edit `.env` and set the following values:

```dotenv
NODE_ENV=development
APP_PORT=3000
DATABASE_URL=postgresql://taskflow:taskflow@localhost:5432/taskflow_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=local-development-secret-do-not-use-in-production
LOG_LEVEL=debug
```

Install Git hooks for linting and formatting:

```bash
npm run prepare
```

This sets up Husky pre-commit hooks that run ESLint and Prettier on staged files before each commit.

## Database Setup

### Option A: Using Docker (Recommended)

Start PostgreSQL and Redis using the development compose file:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts PostgreSQL on port 5432 and Redis on port 6379 with default credentials matching the `.env.example` file.

### Option B: Using Local PostgreSQL

If you have PostgreSQL installed locally, create the development database:

```bash
createuser -s taskflow
createdb -O taskflow taskflow_dev
```

Set the password for the taskflow user:

```bash
psql -c "ALTER USER taskflow WITH PASSWORD 'taskflow';"
```

### Running Migrations

Once the database is available, run the migrations to set up the schema:

```bash
npm run migrate:up
```

To seed the database with sample data for development:

```bash
npm run db:seed
```

The seed script creates the following test data:

- 3 user accounts (admin, manager, developer) with the password `password123`
- 2 sample projects with boards and columns
- 15 sample tasks distributed across projects with various statuses and priorities
- Sample comments and activity log entries

## Running the Application

Start the development server with hot-reload:

```bash
npm run dev
```

The API server starts on `http://localhost:3000` by default. The development server watches for file changes and automatically restarts when source files are modified.

Verify the server is running:

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok" }
```

### Available Development Scripts

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `npm run dev`         | Start development server with hot-reload         |
| `npm run build`       | Compile TypeScript to JavaScript                 |
| `npm run start`       | Start the compiled production server             |
| `npm run lint`        | Run ESLint on all source files                   |
| `npm run lint:fix`    | Auto-fix linting issues                          |
| `npm run format`      | Run Prettier on all source files                 |
| `npm run migrate:up`  | Run pending database migrations                  |
| `npm run migrate:down`| Roll back the most recent migration              |
| `npm run db:seed`     | Populate the database with sample data           |
| `npm run db:reset`    | Drop all tables and re-run migrations and seeds  |

## Running Tests

TaskFlow uses Vitest for unit and integration tests. The test suite requires a running PostgreSQL instance with a separate test database.

Create the test database:

```bash
createdb -O taskflow taskflow_test
```

Or if using Docker, the test database is created automatically by the development compose file.

Run the full test suite:

```bash
npm test
```

Run tests in watch mode during development:

```bash
npm run test:watch
```

Run tests with coverage reporting:

```bash
npm run test:coverage
```

Coverage reports are generated in the `coverage/` directory. The project maintains a minimum coverage threshold of 80% for branches, functions, lines, and statements.

Run only a specific test file:

```bash
npx vitest run src/services/__tests__/task.service.test.ts
```

### Test Categories

| Category    | Location                  | Command                    | Description                         |
| ----------- | ------------------------- | -------------------------- | ----------------------------------- |
| Unit        | `src/**/__tests__/*.test.ts` | `npm run test:unit`     | Isolated logic tests with mocks     |
| Integration | `tests/integration/`      | `npm run test:integration` | Tests with real database            |
| E2E         | `tests/e2e/`              | `npm run test:e2e`         | Full API endpoint tests             |

## Troubleshooting

Below are solutions to common issues encountered during local development setup.

| Problem                                       | Cause                                    | Solution                                                              |
| --------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `ECONNREFUSED 127.0.0.1:5432`                | PostgreSQL is not running                | Start PostgreSQL with `docker compose -f docker-compose.dev.yml up -d` or `brew services start postgresql@15` |
| `ECONNREFUSED 127.0.0.1:6379`                | Redis is not running                     | Start Redis with `docker compose -f docker-compose.dev.yml up -d` or `brew services start redis` |
| `error: database "taskflow_dev" does not exist` | Development database not created       | Run `createdb -O taskflow taskflow_dev` or restart the Docker containers |
| `error: role "taskflow" does not exist`        | Database user not created               | Run `createuser -s taskflow` or check Docker container logs           |
| `Migration failed: relation already exists`    | Migrations run out of order             | Run `npm run db:reset` to drop and recreate all tables                |
| `EADDRINUSE: address already in use :::3000`  | Port 3000 is occupied                   | Kill the existing process with `lsof -ti:3000 \| xargs kill` or change `APP_PORT` in `.env` |
| `JWT_SECRET is not defined`                    | Missing environment variable            | Ensure `.env` file exists and contains `JWT_SECRET`                   |
| `node: command not found`                      | Node.js not installed or not in PATH    | Install Node.js via nvm: `nvm install 20 && nvm use 20`              |
| Tests fail with `connection refused`           | Test database not available             | Create `taskflow_test` database and ensure PostgreSQL is running      |
| `ERR_MODULE_NOT_FOUND`                         | Dependencies not installed              | Run `npm install` from the project root directory                     |

If you encounter an issue not listed here, check the project's GitHub Issues page or reach out on the team's Slack channel.
