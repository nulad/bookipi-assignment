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
- `apps/web` contains a single-page React + Vite flash sale demo UI
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

### Architecture Diagram

```mermaid
flowchart LR
    subgraph Clients
        WEB[React frontend]
        K6[Stress test client]
    end

    subgraph Backend
        API[Express API]
    end

    subgraph Data
        REDIS[(Redis)]
        PG[(Postgres)]
    end

    WEB -->|GET sale status<br/>POST purchase| API
    K6 -->|Concurrent POST /purchase| API
    API -->|Atomic stock + duplicate checks| REDIS
    API -->|Persist sale + purchases| PG
    REDIS -.->|Active sale state<br/>remaining stock<br/>purchased users| API
    PG -.->|Durable purchase records| API
```

### Repository Structure

- `apps/api/src/controllers`: request validation and HTTP response mapping
- `apps/api/src/services`: purchase command flow, active-sale lookup, and status query logic
- `apps/api/src/repositories`: Postgres access
- `apps/api/src/redis`: Lua script and Redis key helpers
- `apps/api/tests`: unit, repository, integration, and concurrency coverage

### Purchase Flow

1. Client calls `POST /purchase` with a `userId`.
2. The controller forwards `userId` from the request body into the purchase service.
3. The service validates and normalizes the user ID for consistent identity checks.
4. Redis runs the Lua script to decide `success`, `already_purchased`, `sold_out`, `sale_not_started`, or `sale_ended`.
5. On `success`, the backend resolves the active sale ID and persists the purchase to Postgres.
6. If the Postgres insert fails after Redis already reserved the slot, the API returns an explicit persistence error, logs the incident, and pushes reconciliation data into Redis for later repair.

Current simplifying assumption: the system effectively operates on one configured active sale at a time, driven by environment configuration and a cached active sale ID in Redis.

## Architecture Rationale Draft

This section is intentionally rough. It exists to capture the reasoning now so the final Day 3 README does not need to be written from scratch.

### Why Redis-First Gating

The hottest part of the system is the decision "can this user take one of the remaining items right now?" That decision needs three checks to happen together under concurrency:

- is the sale currently active
- has this user already purchased
- is there still stock remaining

Redis is used first because the Lua script can evaluate those checks and update stock atomically in one fast operation. That keeps the concurrency gate narrow and avoids turning the main request path into a heavier database-locking problem. The design goal here is not "Redis is the source of truth for everything"; it is "Redis is the operational gate that prevents oversell and duplicate wins in the hottest part of the flow."

### Why Postgres Holds Durable Purchase Records

Redis is a good place to make the immediate concurrency decision, but it is not the system of record for successful purchases. Persisting winners in Postgres gives the project a durable store that survives Redis restarts, supports later audit/reporting needs, and makes `GET /purchase-status/:userId` depend on a stable data source instead of only cached in-memory state.

The `purchases` table also has a unique `(sale_id, user_id)` constraint. That means the "one item per user" rule is defended not only in Redis during the hot path, but also at the durable storage layer. In other words, Redis protects the live race, and Postgres protects the final recorded outcome.

### Why a Queue Was Not Put in the Main Flow

A queue-first design is a valid production direction, but it was intentionally not used in the primary assignment flow. For this scope, the synchronous API keeps the system easier to reason about:

- the caller gets an immediate purchase result
- the core correctness path stays visible in one request flow
- tests can directly prove no-oversell and one-per-user behavior without also introducing worker timing and delivery semantics

Adding a queue in the main path would also require more machinery: worker processes, idempotent consumers, retry rules, poison-message handling, and a clearer strategy for when the user sees "accepted" versus "actually persisted." That complexity is worthwhile at larger scale, but it would blur the assignment's main objective, which is to prove correctness of the flash-sale gate first.

The current compromise is synchronous purchase handling plus explicit reconciliation when Redis succeeds but Postgres persistence fails. A future production evolution could move persistence behind an outbox/queue boundary while keeping Redis as the front-door concurrency gate.

## Container-First Setup

### Prerequisites

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
- Product name: `Flash Sale Item`
- `SALE_START_TIME=2099-01-01T10:00:00.000Z`
- `SALE_END_TIME=2099-01-01T10:10:00.000Z`
- `SALE_INITIAL_STOCK=100`

The checked-in sale window values are placeholders. Before starting the stack, update your
local `.env` so the current time falls inside the sale window you want to review.

### Container Env Wiring

The root `.env` stays host-friendly on purpose:

- `POSTGRES_URL` uses `localhost:5433`
- `POSTGRES_TEST_URL` uses `localhost:5433`
- `REDIS_URL` uses `localhost:6379`

For container runs, `docker compose` overrides only the network hostnames:

- API container talks to Postgres at `postgres:5432`
- API container talks to Redis at `redis:6379`
- stress-test containers call the API at `http://api:3000`
- the web container serves the React build on `localhost:5173` and proxies API paths to `api:3000`

That means the same `.env` file works for both host Node runs and containerized runs.

### Start The App Stack

```bash
docker compose up --build api web
```

What this does:

- starts Postgres and Redis
- waits for both dependencies
- applies the API schema
- initializes the active sale in Redis
- starts the API on `localhost:3000`
- serves the web app on `localhost:5173`

Use these URLs from the host:

- frontend: `http://localhost:5173`
- API: `http://localhost:3000`
- API health: `http://localhost:3000/health`

To stop the stack:

```bash
docker compose down
```

### Containerized Test Commands

Backend tests:

```bash
docker compose run --rm api-test
```

`api-test` is self-seeding: it creates `bookipi_test` and applies the schema through the test harness,
so it does not require a separate `api-init` step.

Reinitialize the active sale state without restarting the full stack:

```bash
docker compose run --rm api-init
```

The repository also includes two k6 stress scenarios:

- [tests/stress/purchase-burst.js](tests/stress/purchase-burst.js) for high-cardinality unique-user bursts
- [tests/stress/purchase-repeated-users.js](tests/stress/purchase-repeated-users.js) for duplicate-purchase pressure from a small repeated-user pool

Before each stress run, make sure the sale window is active in `.env`, then reset sale state:

```bash
docker compose run --rm api-init
```

Burst scenario:

```bash
docker compose run --rm stress-burst
```

Repeated-user scenario:

```bash
docker compose run --rm stress-repeated
```

You can still override k6 env values per run:

```bash
docker compose run --rm -e BURST_RATE=500 -e BURST_DURATION=20s stress-burst
docker compose run --rm -e REPEATED_USER_POOL_SIZE=20 stress-repeated
```

Expected precondition for either stress scenario:

```json
{
  "status": "active",
  "remainingStock": 100
}
```

Expected behavior:

- successful purchases stop at available stock
- duplicate-user rejections stay at `0`
- all responses remain HTTP `200`

Precondition for this scenario:

- `/sale-status` must report `remainingStock >= REPEATED_USER_POOL_SIZE`

Expected behavior:

- each logical user succeeds exactly once
- `already_purchased` responses are observed under load
- all responses remain HTTP `200`
- total successes equal the repeated-user pool size

Supported environment overrides:

- `BASE_URL`
- `PURCHASE_PATH`
- `SALE_STATUS_PATH`
- `BURST_RATE`
- `BURST_DURATION`
- `REPEATED_RATE`
- `REPEATED_DURATION`
- `REPEATED_USER_POOL_SIZE`
- `PRE_ALLOCATED_VUS`
- `MAX_VUS`
- `EXPECTED_MAX_P95_MS`
- `EXPECTED_MAX_P99_MS`

The script will fail fast if:

- the API is not reachable
- `/sale-status` does not return HTTP `200`
- the sale is not currently `active`

### Recorded Stress Test Results

Sample evidence was captured on March 20, 2026 with the default Docker Compose stack, `SALE_INITIAL_STOCK=100`, and the active sale window from the local `.env`.

Full run notes and measured counters are recorded in [docs/stress-test-results.md](docs/stress-test-results.md).

| Scenario | Command | Key expectations | Observed result |
| --- | --- | --- | --- |
| Burst unique users | `docker compose run --rm stress-burst` | No more than 100 purchases succeed, duplicate-user rejections stay at `0`, responses stay HTTP `200` | `3751` attempts, `100` successes, `3651` `sold_out`, `0` `already_purchased`, HTTP `200` rate `100%`, latency `p95=2.67ms`, `p99=33.14ms` |
| Repeated user pool | `docker compose run --rm stress-repeated` | Each logical user succeeds once, duplicate attempts return `already_purchased`, responses stay HTTP `200` | `3751` attempts, `25` successes for a `25`-user pool, `3726` `already_purchased`, HTTP `200` rate `100%`, latency `p95=1.88ms`, `p99=3.63ms` |

These results show the two core reviewer-facing guarantees under load: stock does not oversell in the burst case, and repeated requests from the same logical users still produce only one win per user.

## Local Host Setup

### Prerequisites

- Node.js `>=20`
- Docker and Docker Compose

This path is still available for local development, but it is no longer the main reviewer flow.

Before initializing the sale, edit `.env` and set `SALE_START_TIME` and `SALE_END_TIME`
to a window that should be active for your local run.

```bash
npm ci
npm run infra:up
npm run db:schema:api
npm run sale:init:api
npm run dev:api
npm run dev:web
```

Local ports used during development:

- API on `localhost:3000`
- Postgres on `localhost:5433`
- Redis on `localhost:6379`
- frontend on `localhost:5173` via `npm run dev:web`

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
    "id": "1",
    "saleId": "1",
    "userId": "alice@example.com",
    "purchasedAt": "2026-03-18T10:00:00.000Z"
  }
}
```

`id` and `saleId` come from Postgres `BIGSERIAL`/`BIGINT` columns. They are exposed as strings in the API because the Node Postgres driver returns `int8` values as strings by default.

Other result statuses currently returned by the purchase flow:

- `already_purchased`
- `sold_out`
- `sale_not_started`
- `sale_ended`

Current validation error:

- `400 invalid_request` when `userId` is missing, empty, whitespace-only, or not a string
- all API errors now use the same envelope: `error.type`, `error.code`, and `error.message`

Current operational failure mode:

- `503 purchase_persistence_failed` when Redis accepted the purchase but Postgres could not durably persist it

Example validation error:

```json
{
  "error": {
    "type": "validation_error",
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
docker compose run --rm api-test
docker compose run --rm api-init
docker compose run --rm stress-burst
```

Equivalent host-Node commands still exist:

```bash
npm test
npm run test:api
npm run stress:purchase-burst
```

## Trade-Offs

- Redis Lua keeps stock decrement and duplicate-user checks atomic in the hot path, at the cost of more logic living outside plain JavaScript.
- Postgres is the durable source of truth for successful purchases, which is safer than keeping winners only in Redis.
- If Postgres persistence fails after Redis already reserved stock, the API does not try to roll Redis back blindly because that could oversell if the DB write actually committed before the error surfaced.
- Instead, that path returns `503 purchase_persistence_failed`, logs the failure, and appends a JSON reconciliation record to Redis list `flashsale:purchase_persistence_failures` so the reservation can be reviewed and repaired later.
- The API surface is intentionally small so the core purchase path stays easy to reason about and test.
- Sale configuration is environment-driven and effectively single-sale, which simplifies initialization but does not yet model multiple concurrent campaigns.
- The frontend stays intentionally thin and talks directly to the existing API surface, which keeps the assignment demo easy to reason about but leaves room for a richer client data layer if the app grew.

## Future Improvements

The following items are planned work, not current behavior:

- expand stress and load testing coverage under `tests/stress`
- add better observability around purchase results, failures, and Redis/Postgres health
- support dynamic sale creation and configuration instead of relying on env-only sale setup
- harden reconciliation and idempotency guarantees between Redis and Postgres
- document deployment and more production-oriented infrastructure concerns
