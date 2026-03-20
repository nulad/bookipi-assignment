# Stress Test Results

Captured on March 20, 2026 against the local Docker Compose stack in this repository.

## Test Environment

- stack: `docker compose up -d --build api`
- sale reset before each run: `docker compose run --rm api-init`
- sale window in local `.env`: `2024-01-01T00:00:00.000Z` to `2030-12-31T23:59:59.000Z`
- initial stock: `100`
- k6 defaults: `PRE_ALLOCATED_VUS=200`, `MAX_VUS=1000`, `EXPECTED_MAX_P95_MS=750`, `EXPECTED_MAX_P99_MS=1500`

The k6 scripts include one setup request to `GET /sale-status` before the purchase loop starts. That is why the k6 `http_reqs` count is one higher than the purchase-attempt counter.

## Scenario 1: Burst Unique Users

Command:

```bash
docker compose run --rm api-init
docker compose run --rm stress-burst
```

Scenario used:

- script: `tests/stress/purchase-burst.js`
- arrival rate: `250` iterations/second
- duration: `15s`
- user shape: unique synthetic email per purchase attempt

Expected outcomes:

- the sale must start from `remainingStock=100`
- successful purchases must stop at available stock
- duplicate-user rejections must stay at `0`
- responses must stay HTTP `200`
- latency thresholds must stay below `p95<750ms` and `p99<1500ms`

Actual results:

| Metric | Result |
| --- | --- |
| Purchase attempts | `3751` |
| Successful purchases | `100` |
| `sold_out` responses | `3651` |
| `already_purchased` responses | `0` |
| HTTP 200 rate | `100%` |
| HTTP failures | `0` |
| Unexpected statuses | `0` |
| Latency p95 | `2.67ms` |
| Latency p99 | `33.14ms` |
| Max latency | `701.73ms` |

Summary:

The burst run exhausted stock exactly once and then cleanly switched to `sold_out` responses. No duplicate-user responses appeared, no non-200 responses appeared, and the measured latency stayed well inside the configured k6 thresholds.

## Scenario 2: Repeated User Pool

Command:

```bash
docker compose run --rm api-init
docker compose run --rm stress-repeated
```

Scenario used:

- script: `tests/stress/purchase-repeated-users.js`
- arrival rate: `250` iterations/second
- duration: `15s`
- repeated user pool size: `25`

Expected outcomes:

- the sale must start active with `remainingStock >= 25`
- each logical user must succeed exactly once
- duplicate attempts must return `already_purchased`
- total successes must equal the repeated-user pool size
- responses must stay HTTP `200`
- latency thresholds must stay below `p95<750ms` and `p99<1500ms`

Actual results:

| Metric | Result |
| --- | --- |
| Purchase attempts | `3751` |
| Successful purchases | `25` |
| `already_purchased` responses | `3726` |
| Expected success target | `25` |
| HTTP 200 rate | `100%` |
| HTTP failures | `0` |
| Unexpected statuses | `0` |
| Latency p95 | `1.88ms` |
| Latency p99 | `3.63ms` |
| Max latency | `27.95ms` |

Summary:

The repeated-user run produced exactly one success per logical user in the `25`-user pool and converted the remaining attempts into `already_purchased`. That is the reviewer-facing evidence that the once-per-user rule still holds while requests are arriving continuously.
