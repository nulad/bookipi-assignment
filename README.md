# Flash Sale System

Backend-first take-home project for a high-throughput flash sale system.

## Overview

This repository focuses first on backend correctness for a flash sale flow. The current implementation is designed to prove four core behaviors:

- no overselling under concurrency
- one successful purchase per user
- sale-window enforcement
- durable persistence of successful purchases

Current repo status:

- `apps/api` contains the implemented backend
- `apps/web` is still a placeholder
- local infrastructure runs through Docker Compose with Redis and Postgres

## Architecture Summary

The implemented backend lives in `apps/api/src` and uses a narrow request path to keep concurrency behavior explicit and testable.

- Express handles the HTTP API
- Redis holds the active stock state and purchased-user set for the hot path
- the Lua script in [apps/api/src/redis/purchase.lua](apps/api/src/redis/purchase.lua) makes the purchase decision atomically
- Postgres stores the sale definition and durable purchase records
- the schema in [apps/api/src/scripts/schema.sql](apps/api/src/scripts/schema.sql) defines `sales` and `purchases`
- the unique `(sale_id, user_id)` constraint prevents duplicate persisted wins for the same sale
- [apps/api/src/scripts/init-sale.js](apps/api/src/scripts/init-sale.js) initializes Redis stock state and caches the active sale ID

### Repository Structure

- `apps/api/src/controllers`: request validation and HTTP response mapping
- `apps/api/src/services`: purchase and sale-status business logic
- `apps/api/src/repositories`: Postgres access
- `apps/api/src/redis`: Lua script and Redis key helpers
- `apps/api/tests`: unit, repository, integration, and concurrency coverage

### Purchase Flow

1. Client calls `POST /purchase` with a `userId`.
2. The controller validates that `userId` is a non-empty string.
3. The service normalizes the user ID for consistent identity checks.
4. Redis runs the Lua script to decide `success`, `already_purchased`, `sold_out`, `sale_not_started`, or `sale_ended`.
5. On `success`, the backend resolves the active sale ID and persists the purchase to Postgres.

Current simplifying assumption: the system effectively operates on one configured active sale at a time, driven by environment configuration and a cached active sale ID in Redis.

## Local Setup

### Prerequisites

- Node.js `>=20`
- Docker and Docker Compose

### Environment

Copy the example environment file and adjust values if needed:

```bash
cp .env.example .env
```

Relevant defaults from [.env.example](.env.example):

- API port: `3000`
- Postgres: `postgresql://bookipi:bookipi123@localhost:5433/bookipi`
- Test Postgres: `postgresql://bookipi:bookipi123@localhost:5433/bookipi_test`
- Redis: `redis://localhost:6379`

### Run Locally

```bash
npm install
npm run infra:up
npm run db:schema:api
npm run sale:init:api
npm run dev:api
```

Local service ports from [docker-compose.yml](docker-compose.yml):

- API on `localhost:3000`
- Postgres on `localhost:5433`
- Redis on `localhost:6379`

Tests use `POSTGRES_TEST_URL` when running in test mode.

## API Endpoints

### `GET /health`

Purpose: basic health check for the API process.

Successful response:

```json
{
  "status": "ok"
}
```

### `GET /sale-status`

Purpose: return the current sale state and remaining stock from Redis.

Successful response shape:

```json
{
  "status": "active",
  "remainingStock": 4
}
```

Known sale statuses:

- `upcoming`
- `active`
- `sold_out`
- `ended`

### `GET /purchase-status/:userId`

Purpose: check whether a normalized user already has a persisted purchase.

Request shape:

- path parameter: `userId`

Successful response shape:

```json
{
  "userId": "winner@example.com",
  "hasPurchased": true
}
```

### `POST /purchase`

Purpose: attempt to buy one unit during the flash sale.

Request body:

```json
{
  "userId": "alice@example.com"
}
```

Successful response shape on a winning purchase:

```json
{
  "status": "success",
  "purchase": {
    "id": 1,
    "saleId": 1,
    "userId": "alice@example.com",
    "purchasedAt": "2026-03-18T10:00:00.000Z"
  }
}
```

Other result statuses currently returned by the purchase flow:

- `already_purchased`
- `sold_out`
- `sale_not_started`
- `sale_ended`

Current validation error:

- `400 invalid_request` when `userId` is missing, empty, whitespace-only, or not a string

Example validation error:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "userId must be a non-empty string"
  }
}
```

## Testing Approach

The backend test suite in `apps/api/tests` is layered to cover both correctness and concurrency behavior.

- unit tests cover utilities, controllers, services, routes, env parsing, and Redis key helpers
- repository tests cover Postgres-backed sale and purchase data access
- integration tests exercise the HTTP API end to end
- concurrency tests verify Redis Lua behavior directly and the API behavior under racing requests

The strongest concurrency claims currently covered are:

- the system never records more successful purchases than available stock
- the same user cannot win more than once, even under concurrent requests

Current test commands:

```bash
npm test
npm run test:api
```

These tests rely on local Redis and Postgres being available.

## Trade-Offs

- Redis Lua keeps stock decrement and duplicate-user checks atomic in the hot path, at the cost of more logic living outside plain JavaScript.
- Postgres is the durable source of truth for successful purchases, which is safer than keeping winners only in Redis.
- The API surface is intentionally small so the core purchase path stays easy to reason about and test.
- Sale configuration is environment-driven and effectively single-sale, which simplifies initialization but does not yet model multiple concurrent campaigns.
- The frontend was deferred so backend correctness and concurrency guarantees could be established first.

## Future Improvements

The following items are planned work, not current behavior:

- build out `apps/web` for live sale status, purchase submission, and purchase-status checks
- add stress and load testing under `tests/stress`
- add better observability around purchase results, failures, and Redis/Postgres health
- support dynamic sale creation and configuration instead of relying on env-only sale setup
- harden reconciliation and idempotency guarantees between Redis and Postgres
- document deployment and more production-oriented infrastructure concerns
