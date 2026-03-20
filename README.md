# Flash Sale System

Backend-first take-home project for a high-throughput flash sale system.

## Overview

This repository focuses first on backend correctness for a flash sale flow. The current implementation is designed to prove four core behaviors:

- no overselling under concurrency
- one successful purchase per user
- sale-window enforcement
- durable persistence of successful purchases

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
        LUA[Redis Lua purchase gate]
        RECON[Manual reconciliation CLI]
        INIT[Sale initialization script]
    end

    subgraph Data
        REDIS[(Redis)]
        SCHEMA[(Postgres schema:<br/>sales + purchases)]
        PG[(Postgres)]
    end

    WEB -->|GET sale status<br/>POST purchase| API
    K6 -->|Concurrent POST /purchase| API
    API -->|Executes atomic decision| LUA
    LUA -->|Single atomic stock + duplicate check boundary| REDIS
    API -->|Persist successful purchase| PG
    PG -.->|sales + purchases rows| SCHEMA
    INIT -->|Seeds sale state<br/>caches active sale ID| REDIS
    INIT -->|Creates or refreshes sale definition| PG
    API -.->|On persistence failure,<br/>enqueue repair record| REDIS
    RECON -->|Repairs queued failures<br/>archives outcomes| REDIS
    RECON -->|Backfills missing durable purchases| PG
    REDIS -.->|Active sale state<br/>remaining stock<br/>purchased users<br/>reconciliation queue| API
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

## Design Decisions & Trade-Offs

This implementation optimizes first for reviewer-visible correctness under concurrency. The core decision is to let Redis own the hot-path purchase gate, let Postgres own durable purchase records, and keep `POST /purchase` synchronous so the full correctness path remains easy to inspect and test. The detailed rationale appears in [Architecture Rationale](#architecture-rationale), the operational compromises are listed in [Trade-Offs](#trade-offs), and the deliberately deferred production concerns are called out in [Future Improvements](#future-improvements).

## Architecture Rationale

This implementation is designed to make the flash-sale gate correct under concurrency while keeping the system small enough to review end to end. The central design choice is to separate the live purchase decision from durable record keeping: Redis handles the race, and Postgres stores the final outcome.

### Why Redis Handles the Purchase Gate

The hottest part of the system is the decision "can this user claim one of the remaining items right now?" Under load, that decision must evaluate three rules together:

- the sale is currently active
- the user has not already purchased
- stock is still available

The Redis Lua script performs those checks and updates stock in one atomic operation. That makes the concurrency boundary explicit, keeps the hot path fast, and avoids spreading race-sensitive logic across multiple database round trips or row-locking steps. Redis is not presented here as the permanent source of truth for all purchase data; it is the operational gate that prevents oversell and duplicate winners at the moment requests collide.

### Why Postgres Stores Successful Purchases

Redis is well suited to making the immediate concurrency decision, but successful purchases still need a durable system of record. Postgres fills that role by storing completed purchases in a form that survives Redis restarts, supports later reporting, and gives `GET /purchase-status/:userId` a stable backing store.

The `purchases` table also enforces a unique `(sale_id, user_id)` constraint. That provides defense in depth for the "one item per user" rule: Redis protects the live race, and Postgres protects the final persisted result.

### Why the Main Flow Stays Synchronous

A queue-first design can be a strong production option, but it was intentionally not introduced into the primary request path for this assignment. Keeping `POST /purchase` synchronous has three benefits for the current scope:

- the caller receives an immediate purchase result
- the correctness path remains visible in a single request flow
- tests can prove no-oversell and one-per-user behavior without also depending on worker timing or delivery semantics

Putting a queue in the middle of the flow would add worker orchestration, idempotent consumer rules, retry policy, poison-message handling, and a more complicated user-facing contract around "accepted" versus "persisted." Those are valid production concerns, but they are not required to demonstrate the core correctness properties this project is focused on.

The current compromise is synchronous purchase handling with explicit reconciliation if Redis succeeds but Postgres persistence fails. A natural production evolution would be to introduce an outbox or queue-backed persistence step while still keeping Redis as the front-door concurrency gate.

## Container-First Setup

### Prerequisites

- Docker and Docker Compose

### Reviewer Quick Start

1. Copy the example environment file:

```bash
cp .env.example .env
```

2. Edit `.env` before you run anything and replace the placeholder `SALE_START_TIME` and `SALE_END_TIME` values with a window that includes the current time.

> ⚠️ If you skip this step, the default `2099` timestamps in `.env.example` will make the UI show an `upcoming` sale and purchase attempts will return `sale_not_started`.

3. Start the stack:

```bash
docker compose up --build api web
```

4. Verify the seeded sale is active:

- open `http://localhost:5173`, or
- call `http://localhost:3000/sale-status` and confirm the response status is `active`

If you already started the stack with the placeholder timestamps, edit `.env`, then recreate the API so it reloads the new timestamps and reseeds Redis:

```bash
docker compose down
docker compose up --build api web
```

### Environment

Relevant defaults from [.env.example](.env.example):

- API port: `3000`
- Postgres: `postgresql://bookipi:bookipi123@localhost:5433/bookipi`
- Test Postgres: `postgresql://bookipi:bookipi123@localhost:5433/bookipi_test`
- Redis: `redis://localhost:6379`
- CORS allowed origin: `*` by default for take-home demo convenience; set `CORS_ALLOWED_ORIGIN` if you want a narrower origin
- Product name: `Flash Sale Item`
- `SALE_START_TIME=2099-01-01T10:00:00.000Z`
- `SALE_END_TIME=2099-01-01T10:10:00.000Z`
- `SALE_INITIAL_STOCK=100`

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

What this does:

- starts Postgres and Redis
- starts the API container, which runs `wait:deps`, `db:schema`, `sale:init`, then `start`
- `sale:init` creates or loads the configured sale record, resets Redis stock, clears purchased users, and caches the active sale ID
- starts the API on `localhost:3000` with the sale window loaded from `.env`
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

`api-init` runs the same dependency wait + schema + `sale:init` sequence as the API container startup. Use it when you want to reset Redis sale state and active-sale caching against the current container env. If you changed `SALE_START_TIME` or `SALE_END_TIME`, restart the API container as well so the running process reloads those timestamps.

The repository also includes two k6 stress scenarios:

- [tests/stress/purchase-burst.js](tests/stress/purchase-burst.js) for high-cardinality unique-user bursts
- [tests/stress/purchase-repeated-users.js](tests/stress/purchase-repeated-users.js) for duplicate-purchase pressure from a small repeated-user pool

Before each stress run, make sure the sale window is active in `.env`, then reset sale state:

```bash
docker compose run --rm api-init
```

Burst scenario intent:

- prove stock does not oversell under a burst of unique users

Precondition:

- `/sale-status` should report an active sale with `remainingStock=100` when using the default seed

Run command:

```bash
docker compose run --rm stress-burst
```

Expected behavior:

- successful purchases stop at available stock
- duplicate-user rejections stay at `0`
- all responses remain HTTP `200`

Repeated-user scenario intent:

- prove each logical user can win at most once even when requests repeat under load

Precondition:

- `/sale-status` must report `remainingStock >= REPEATED_USER_POOL_SIZE`

Run command:

```bash
docker compose run --rm stress-repeated
```

Expected behavior:

- each logical user succeeds exactly once
- `already_purchased` responses are observed under load
- all responses remain HTTP `200`
- total successes equal the repeated-user pool size

You can still override k6 env values per run:

```bash
docker compose run --rm -e BURST_RATE=500 -e BURST_DURATION=20s stress-burst
docker compose run --rm -e REPEATED_USER_POOL_SIZE=20 stress-repeated
```

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

Sample evidence was captured against the default Docker Compose stack with `SALE_INITIAL_STOCK=100` and an active sale window from the local `.env`.

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
to a window that should be active for your local run. If you keep the placeholder `2099`
values, the sale will stay `upcoming` and purchases will return `sale_not_started`.

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

## Manual Reconciliation

When `POST /purchase` succeeds in Redis but fails to persist in Postgres, the API appends a JSON record to Redis list `flashsale:purchase_persistence_failures`.

The manual reconciliation CLI now lets an operator review and repair that queue without editing Redis directly.

Inspect the current queue without changing data:

```bash
npm run purchase:reconcile:api
```

Apply repairs and archive processed records:

```bash
npm run purchase:reconcile:api -- --apply
```

One-command smoke test for the full inspect -> repair -> verify flow:

```bash
npm run smoke:reconciliation
```

Optional: process only the first `N` queued records:

```bash
npm run purchase:reconcile:api -- --apply --limit 10
```

Equivalent container-first command:

```bash
docker compose run --rm api npm run purchase:reconcile:api -- --apply
```

The command processes records from the head of the queue and uses this flow for each item:

- parse the stored JSON payload from `flashsale:purchase_persistence_failures`
- check whether the `(saleId, userId)` purchase already exists in Postgres
- insert the purchase if it is still missing
- append the handled record to Redis archive list `flashsale:purchase_persistence_failures_archive`
- remove the original queue item only after the repair outcome is known and the archive write succeeds

If the command hits a malformed record, it archives the raw payload with status `archived_invalid` instead of silently dropping it. If Postgres or Redis fails during repair, the current queue item is left in place so the command can be retried safely.

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

Demo-scope note: the API currently defaults `Access-Control-Allow-Origin` to `*` for take-home review convenience. Set `CORS_ALLOWED_ORIGIN` in `.env` if you want to restrict it.

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
docker compose run --rm api npm run purchase:reconcile:api -- --apply
docker compose run --rm stress-burst
```

Equivalent host-Node commands still exist:

```bash
npm test
npm run test:api
npm run purchase:reconcile:api
npm run stress:purchase-burst
```

## Trade-Offs

- Redis Lua keeps stock decrement and duplicate-user checks atomic in the hot path, at the cost of more logic living outside plain JavaScript.
- Postgres is the durable source of truth for successful purchases, which is safer than keeping winners only in Redis.
- If Postgres persistence fails after Redis already reserved stock, the API does not try to roll Redis back blindly because that could oversell if the DB write actually committed before the error surfaced.
- Instead, that path returns `503 purchase_persistence_failed`, logs the failure, appends a JSON reconciliation record to Redis list `flashsale:purchase_persistence_failures`, and relies on the manual reconciliation CLI to repair and archive those records safely.
- The API surface is intentionally small so the core purchase path stays easy to reason about and test.
- Sale configuration is environment-driven and effectively single-sale, which simplifies initialization but does not yet model multiple concurrent campaigns.
- The frontend stays intentionally thin and talks directly to the existing API surface, which keeps the assignment demo easy to reason about but leaves room for a richer client data layer if the app grew.

## Future Improvements

The following items are planned work, not current behavior:

- expand stress and load testing coverage under `tests/stress` so the current correctness claims are exercised across more traffic shapes and failure conditions
- add better observability around purchase results, failures, and Redis/Postgres health because the assignment prioritizes correctness first, while production diagnostics were intentionally kept secondary
- support dynamic sale creation and configuration instead of relying on env-only sale setup, which was a deliberate simplification to keep the review path centered on a single active sale
- automate reconciliation instead of relying on an operator-run CLI, which was deferred to keep failure recovery explicit and easy to review end to end
- document deployment and more production-oriented infrastructure concerns, which were left out so the repository could stay focused on the core purchase path and local reproducibility
