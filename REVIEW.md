# Submission Review: Flash Sale System

## Requirement Coverage

| Requirement | Status | Notes |
|---|---|---|
| Flash sale period (configurable start/end) | **Pass** | Env-driven, enforced in Redis Lua script |
| Single product, limited stock | **Pass** | `SALE_INITIAL_STOCK`, atomic decrement in Lua |
| One item per user | **Pass** | Redis set + Postgres UNIQUE(sale_id, user_id) |
| Sale status endpoint | **Pass** | `GET /sale-status` |
| Purchase endpoint | **Pass** | `POST /purchase` |
| Purchase check endpoint | **Pass** | `GET /purchase-status/:userId` |
| React frontend | **Pass** | Vite + React, polls status, buy/lookup forms |
| System diagram | **Pass** | Mermaid flowchart in README |
| High throughput & scalability | **Pass** | Redis Lua atomic gating, k6 stress tests prove it |
| Concurrency control | **Pass** | Lua script is the standout piece — atomic 3-way check |
| Fault tolerance | **Partial** | Reconciliation list exists but no background worker to process it |
| Unit & integration tests | **Pass** | 29 test files across 4 layers |
| Stress tests | **Pass** | Two k6 scenarios with documented results |
| Docker setup | **Pass** | Full compose with health checks |
| README with instructions | **Pass** | Comprehensive |

---

## Strengths

1. **Redis Lua script** is the right approach — atomic stock+user+time check avoids race conditions without distributed locks
2. **Defense in depth** — Redis for speed, Postgres UNIQUE constraint as safety net
3. **Test coverage is excellent** — unit, repo, integration, concurrency, and stress layers with 29 test files
4. **Stress test results are compelling** — 3751 requests, perfect correctness, sub-3ms p95
5. **Clean architecture** — controllers/services/repositories separation is well-structured
6. **README is thorough** — trade-offs, rationale, and setup instructions are all well-documented

---

## Issues to Consider Fixing Before Submission

### Medium Priority

1. **No reconciliation worker** — You record Postgres persistence failures to a Redis list but nothing ever processes them. The README mentions it as a future improvement, but at minimum add a comment or script stub showing how you'd drain it. A reviewer might see this as an incomplete failure path.

2. **No request logging** — Adding a simple request logger middleware (even just `method + path + status + duration`) would show production-readiness awareness. It's a small addition that signals maturity.

3. **No rate limiting** — The assignment explicitly mentions handling "thousands of users attempting to purchase simultaneously." Even a basic in-memory rate limiter on `/purchase` would demonstrate you've thought about abuse scenarios.

### Low Priority (Nice-to-Have)

4. **CORS is wide open** (`*`) — Fine for demo, but worth a one-line comment explaining it's intentional for the take-home scope.

5. **Postgres pool tuning** — Default `pg.Pool` settings may not be optimal under high concurrency. Even just setting `max: 20` explicitly shows awareness.

6. **Frontend is minimal** — It works, but the styling is basic. If you have time, a bit of polish (loading states, countdown timer for sale start) would make the demo more impressive.

7. **Sale times default to 2099** — A reviewer running `docker compose up` will see "upcoming" status. Consider setting defaults that activate the sale immediately, or document this clearly in the setup instructions.

---

## Verdict

This is a **strong submission**. The core concurrency problem is solved correctly with the Redis Lua script approach, the testing is thorough and multi-layered, and the architecture decisions are well-justified in the README. The stress test results concretely prove the system works under load.

The main gap is the incomplete reconciliation path (failure recorded but never replayed), which a sharp reviewer might probe. Everything else is solid.
