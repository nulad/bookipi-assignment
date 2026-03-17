# Flash Sale System — Implementation Plan

## Goal

Build a backend-first flash sale system that proves:

- no overselling under concurrency
- one item per user
- correct sale window handling
- durable persistence of successful purchases
- simple but working React frontend
- strong tests and stress-test evidence

---

# Overall Milestones

## Day 1 — Core backend correctness
Target:
- Redis + Postgres running
- purchase hot path implemented
- API endpoints working
- unit + integration tests started
- at least one strong concurrency test passing

## Day 2 — Full-stack completion
Target:
- basic React frontend working
- backend cleaned up
- more integration/concurrency coverage
- stronger purchase-status flow
- better error handling

## Day 3 — Stress tests, documentation, polish
Target:
- k6 stress tests
- README completed
- architecture diagram added
- trade-offs and production evolution documented
- final cleanup

---

# Day 1 Tasks

## Foundation

### [x] D1-T01 Create monorepo skeleton
**Goal:** establish repo structure for backend-first development.

**Do:**
- create `apps/api`
- create `apps/web`
- create `tests/stress`
- create root `README.md`
- create root `.gitignore`

**Done when:**
- repo structure exists
- backend and frontend folders are separated cleanly

**Notes:**
- frontend can remain mostly empty on Day 1

---

### [x] D1-T02 Initialize root package configuration
**Goal:** make local development commands easy.

**Do:**
- create root `package.json`
- define scripts for:
  - install
  - run backend
  - run tests
  - bring infra up/down
- optionally set up npm workspaces

**Done when:**
- root scripts are usable
- developer can run backend and infra from root

---

### [x] D1-T03 Add environment configuration
**Goal:** centralize runtime config.

**Do:**
- create `.env.example`
- define:
  - `PORT`
  - `POSTGRES_URL`
  - `REDIS_URL`
  - `SALE_START_TIME`
  - `SALE_END_TIME`
  - `SALE_INITIAL_STOCK`

**Done when:**
- all required config values are documented
- backend can read env values cleanly

---

## Infrastructure

### [x] D1-T04 Create Docker Compose for Redis and Postgres
**Goal:** run dependencies locally in a reproducible way.

**Do:**
- create `docker-compose.yml`
- configure:
  - Redis
  - Postgres
- expose ports
- define DB credentials

**Done when:**
- `docker compose up` starts Redis and Postgres successfully
- both services are reachable locally

**Priority:** Must-have

---

### [x] D1-T05 Add backend Redis and Postgres clients
**Goal:** connect API to infrastructure.

**Do:**
- create Redis client module
- create Postgres pool/client module
- verify connectivity

**Done when:**
- backend connects to Redis
- backend connects to Postgres
- failures are visible and understandable

**Priority:** Must-have

---

## Core Business Logic

### [x] D1-T06 Implement sale status utility
**Goal:** define pure sale-state logic.

**File target:**
- `apps/api/src/utils/sale-status.js`

**Do:**
- implement `getSaleStatus({ now, startTime, endTime, remainingStock })`

**Rules:**
- `upcoming` when `now < startTime`
- `active` when `startTime <= now <= endTime` and stock > 0
- `sold_out` when within window and stock = 0
- `ended` when `now > endTime`

**Done when:**
- function handles normal and boundary cases correctly

---

### [x] D1-T07 Implement user ID normalization utility
**Goal:** ensure consistent user identity handling.

**File target:**
- `apps/api/src/utils/normalize-user-id.js`

**Do:**
- trim whitespace
- lowercase
- reject empty input

**Done when:**
- same logical user maps to same normalized value
- invalid empty user input is rejected

---

### [x] D1-T08 Write unit tests for pure utilities
**Goal:** lock in basic rules before wiring infra.

**Files target:**
- `apps/api/tests/unit/sale-status.test.js`
- `apps/api/tests/unit/normalize-user-id.test.js`

**Do:**
- test sale status utility
- test normalization utility

**Done when:**
- tests pass
- includes boundary cases
- includes invalid input case

**Priority:** Must-have

---

## Persistence

### [x] D1-T09 Create initial database schema
**Goal:** persist successful purchases durably.

**File target:**
- `apps/api/src/scripts/schema.sql`

**Tables:**
- `sales`
- `purchases`

**Important constraint:**
- unique `(sale_id, user_id)`

**Done when:**
- tables are created in Postgres
- DB constraint prevents duplicate user purchases per sale

**Priority:** Must-have

---

### [ ] D1-T10 Create sale and purchase repository modules
**Goal:** encapsulate DB access.

**Files target:**
- `apps/api/src/repositories/sale.repository.js`
- `apps/api/src/repositories/purchase.repository.js`

**Do:**
- create purchase
- find purchase by user ID
- count purchases

**Done when:**
- repository methods work against Postgres
- duplicate insert is prevented by DB constraint

---

## Redis Flash Sale Hot Path

### [ ] D1-T11 Define Redis key strategy
**Goal:** establish predictable key usage.

**Suggested keys:**
- `flashsale:stock`
- `flashsale:purchased_users`

**Done when:**
- key names are decided and used consistently

---

### [ ] D1-T12 Implement Redis sale initialization/reset script
**Goal:** quickly seed stock and clear purchase state.

**File target:**
- `apps/api/src/scripts/init-sale.js`

**Do:**
- set stock counter in Redis
- clear purchased-users set

**Done when:**
- script resets sale state deterministically
- script is usable for local runs and tests

**Priority:** Must-have

---

### [ ] D1-T13 Implement Redis Lua purchase script
**Goal:** make purchase decision atomic under concurrency.

**File target:**
- `apps/api/src/redis/purchase.lua`

**Do atomically:**
- check sale not started
- check sale ended
- check already purchased
- check stock > 0
- decrement stock
- mark user as purchased

**Return values:**
- `SUCCESS`
- `ALREADY_PURCHASED`
- `SOLD_OUT`
- `NOT_STARTED`
- `ENDED`

**Done when:**
- no overselling
- one item per user is enforced atomically
- result codes are stable and clear

**Priority:** Must-have  
**Risk:** Highest Day 1 risk

---

## Services

### [ ] D1-T14 Implement purchase service
**Goal:** connect validation, Redis decisioning, and DB persistence.

**File target:**
- `apps/api/src/services/purchase.service.js`

**Do:**
- normalize user ID
- execute Lua script
- map Lua result to API result
- on success, insert purchase into DB

**Done when:**
- service returns:
  - `success`
  - `already_purchased`
  - `sold_out`
  - `sale_not_started`
  - `sale_ended`
- successful purchase persists in DB

**Priority:** Must-have

---

### [ ] D1-T15 Implement sale service
**Goal:** expose sale status and purchase lookup.

**File target:**
- `apps/api/src/services/sale.service.js`

**Do:**
- get remaining stock from Redis
- compute current sale status
- fetch purchase status from DB

**Done when:**
- service provides sale state and user purchase state correctly

---

## API

### [ ] D1-T16 Create Express app skeleton
**Goal:** bootstrap HTTP server cleanly.

**Files target:**
- `apps/api/src/app.js`
- `apps/api/src/server.js`

**Do:**
- add JSON middleware
- mount routes
- add basic error handling

**Done when:**
- app starts successfully
- JSON endpoints are reachable

**Priority:** Must-have

---

### [ ] D1-T17 Implement sale routes and controllers
**Goal:** expose read-only sale endpoints.

**Files target:**
- `apps/api/src/routes/sale.routes.js`
- `apps/api/src/controllers/sale.controller.js`

**Endpoints:**
- `GET /sale-status`
- `GET /purchase-status/:userId`

**Done when:**
- endpoints return valid JSON
- purchase status reflects persisted state

---

### [ ] D1-T18 Implement purchase route and controller
**Goal:** expose the purchase endpoint.

**Files target:**
- `apps/api/src/routes/purchase.routes.js`
- `apps/api/src/controllers/purchase.controller.js`

**Endpoint:**
- `POST /purchase`

**Request body:**
```json
{ "userId": "alice@example.com" }
````

**Done when:**

* endpoint accepts `{ userId }`
* returns purchase result JSON
* invalid input is handled cleanly

**Priority:** Must-have

---

## Testing

### [ ] D1-T19 Set up backend test harness

**Goal:** make integration/concurrency tests reproducible.

**Do:**

* set up test runner
* add Supertest
* create setup/teardown helpers
* add DB cleanup and Redis reset utilities

**Done when:**

* tests can run repeatedly without leftover state
* app can boot inside tests

---

### [ ] D1-T20 Write integration tests for sale status endpoint

**Goal:** verify sale read path.

**File target:**

* `apps/api/tests/integration/sale-status.api.test.js`

**Cases:**

* upcoming
* active
* ended
* sold_out

**Done when:**

* endpoint returns correct status and stock

---

### [ ] D1-T21 Write integration tests for purchase endpoint

**Goal:** verify purchase rules through HTTP.

**File target:**

* `apps/api/tests/integration/purchase.api.test.js`

**Cases:**

* success
* repeat attempt from same user returns `already_purchased`
* sold out returns `sold_out`
* before sale returns `sale_not_started`
* after sale returns `sale_ended`
* invalid `userId` is rejected

**Done when:**

* purchase rules are covered by API tests

**Priority:** Must-have

---

### [ ] D1-T22 Write integration tests for purchase status endpoint

**Goal:** verify persisted winner lookup.

**File target:**

* `apps/api/tests/integration/purchase-status.api.test.js`

**Cases:**

* user not purchased returns `false`
* successful user returns `true`

**Done when:**

* endpoint reflects durable purchase outcome correctly

---

### [ ] D1-T23 Write no-oversell concurrency test

**Goal:** prove stock cannot be oversold.

**File target:**

* `apps/api/tests/concurrency/no-oversell.test.js`

**Setup:**

* stock = 10
* 100 concurrent unique users
* sale is active

**Assertions:**

* exactly 10 successes
* DB purchase count = 10
* Redis stock = 0

**Done when:**

* test passes consistently across multiple runs

**Priority:** Must-have
**Value:** Highest proof-of-correctness test

---

### [ ] D1-T24 Write same-user race test

**Goal:** prove duplicate concurrent requests from one user are safe.

**File target:**

* `apps/api/tests/concurrency/same-user-race.test.js`

**Setup:**

* stock = 10
* 20 concurrent requests for same user

**Assertions:**

* at most one success
* all others are `already_purchased`
* DB contains exactly one purchase record for that user

**Done when:**

* test passes consistently

---

## Documentation

### [ ] D1-T25 Start README scaffold

**Goal:** capture design reasoning while fresh.

**Sections to create:**

* overview
* architecture summary
* local setup
* API endpoints
* testing approach
* trade-offs
* future improvements

**Done when:**

* README skeleton exists
* rough design notes are captured

---

# Day 1 Priority Order

Follow this order unless blocked:

1. D1-T01 Create monorepo skeleton
2. D1-T02 Initialize root package configuration
3. D1-T03 Add environment configuration
4. D1-T04 Create Docker Compose for Redis and Postgres
5. D1-T05 Add backend Redis and Postgres clients
6. D1-T06 Implement sale status utility
7. D1-T07 Implement user ID normalization utility
8. D1-T08 Write unit tests for pure utilities
9. D1-T09 Create initial database schema
10. D1-T11 Define Redis key strategy
11. D1-T12 Implement Redis sale initialization/reset script
12. D1-T13 Implement Redis Lua purchase script
13. D1-T10 Create sale and purchase repository modules
14. D1-T14 Implement purchase service
15. D1-T15 Implement sale service
16. D1-T16 Create Express app skeleton
17. D1-T17 Implement sale routes and controllers
18. D1-T18 Implement purchase route and controller
19. D1-T19 Set up backend test harness
20. D1-T21 Write integration tests for purchase endpoint
21. D1-T20 Write integration tests for sale status endpoint
22. D1-T22 Write integration tests for purchase status endpoint
23. D1-T23 Write no-oversell concurrency test
24. D1-T24 Write same-user race test
25. D1-T25 Start README scaffold

---

# Day 1 Must-Finish Subset

If time gets tight, finish these first:

* [ ] D1-T04 Create Docker Compose for Redis and Postgres
* [ ] D1-T05 Add backend Redis and Postgres clients
* [ ] D1-T06 Implement sale status utility
* [ ] D1-T07 Implement user ID normalization utility
* [ ] D1-T08 Write unit tests for pure utilities
* [ ] D1-T09 Create initial database schema
* [ ] D1-T12 Implement Redis sale initialization/reset script
* [ ] D1-T13 Implement Redis Lua purchase script
* [ ] D1-T14 Implement purchase service
* [ ] D1-T16 Create Express app skeleton
* [ ] D1-T18 Implement purchase route and controller
* [ ] D1-T21 Write integration tests for purchase endpoint
* [ ] D1-T23 Write no-oversell concurrency test

---

# Day 2 Tasks

## Backend Completion

### [ ] D2-T01 Refactor backend structure after Day 1 learning

**Goal:** clean up rough edges from Day 1.

**Do:**

* simplify service/repository boundaries if needed
* remove dead code
* improve naming consistency

**Done when:**

* backend feels coherent and easier to explain

---

### [ ] D2-T02 Improve error handling

**Goal:** make failures explicit and reviewer-friendly.

**Do:**

* add centralized error middleware
* normalize API error payloads
* distinguish validation vs internal errors

**Done when:**

* API returns clean, predictable errors

---

### [ ] D2-T03 Handle DB-write failure after Redis success

**Goal:** address the main partial-failure weakness.

**Do:**

* add controlled error path if DB insert fails
* log failure clearly
* optionally record reconciliation data for future repair

**Done when:**

* behavior is explicit
* README can explain the gap and mitigation

---

### [ ] D2-T04 Add stronger integration coverage

**Goal:** improve confidence in business rules.

**Do:**

* add more edge cases
* add boundary-time cases
* verify normalization consistency across endpoints

**Done when:**

* core business rules are well covered

---

### [ ] D2-T05 Add mixed-user concurrency test

**Goal:** prove duplicate + unique user combinations are safe.

**Do:**

* create scenario with repeated and unique user IDs
* assert no duplicate winner and no overselling

**Done when:**

* mixed contention behavior is proven

---

## Frontend

### [ ] D2-T06 Initialize simple React frontend

**Goal:** create the minimum UI needed by the assignment.

**Do:**

* initialize React app in `apps/web`
* keep tooling minimal
* no UI library unless truly needed

**Done when:**

* frontend runs locally

---

### [ ] D2-T07 Build single-page flash sale UI

**Goal:** provide the required user flow.

**UI should support:**

* show sale status
* show remaining stock
* enter user ID
* click Buy Now
* display purchase result
* check purchase status

**Done when:**

* a reviewer can demo the full assignment flow from browser

---

### [ ] D2-T08 Connect frontend to backend endpoints

**Goal:** make the UI functional.

**Do:**

* call `GET /sale-status`
* call `POST /purchase`
* call `GET /purchase-status/:userId`

**Done when:**

* frontend reflects real backend state

---

### [ ] D2-T09 Add basic frontend polling or refresh strategy

**Goal:** keep status simple but usable.

**Recommendation:**

* poll sale status every few seconds
* purchase result can remain immediate and server-driven

**Done when:**

* status updates are simple and understandable

---

## Documentation Support

### [ ] D2-T10 Draft architecture explanation

**Goal:** avoid writing README from scratch on Day 3.

**Do:**

* explain Redis-first gating
* explain Postgres durability
* explain why queue was not implemented in the main flow

**Done when:**

* architecture rationale exists in rough written form

---

# Day 3 Tasks

## Stress Testing

### [ ] D3-T01 Add k6 stress test script for burst traffic

**Goal:** simulate many users attempting purchase concurrently.

**File target:**

* `tests/stress/purchase-burst.js`

**Scenario:**

* high number of unique users
* active sale
* traffic burst over short period

**Done when:**

* script runs locally and produces useful output

---

### [ ] D3-T02 Add second stress scenario for repeated users

**Goal:** test duplicate-purchase behavior under load.

**Done when:**

* repeated-user scenario is covered by k6 or documented as lower priority

---

### [ ] D3-T03 Capture and summarize stress test results

**Goal:** provide reviewer-friendly evidence.

**Do:**

* record the scenario used
* record expected outcomes
* summarize actual results

**Done when:**

* README can describe what the test proves

---

## Documentation

### [ ] D3-T04 Add Mermaid architecture diagram

**Goal:** satisfy architecture deliverable clearly.

**Diagram should include:**

* React frontend
* Express API
* Redis
* Postgres
* stress test client

**Done when:**

* diagram is readable in GitHub markdown

---

### [ ] D3-T05 Complete README

**Goal:** make the repo submission-ready.

**Must include:**

* design choices
* trade-offs
* architecture diagram
* how to run backend/frontend/tests
* how to run stress tests
* expected outcomes
* what would change in production

**Done when:**

* a reviewer can clone and understand the system without asking questions

---

### [ ] D3-T06 Add “production evolution” section

**Goal:** show senior engineering judgment.

**Include:**

* queue/outbox option
* reconciliation for Redis success / DB failure
* rate limiting and bot mitigation
* horizontal scaling of stateless API servers
* observability additions

**Done when:**

* future-state explanation is strong and realistic

---

## Final Cleanup

### [ ] D3-T07 Final code cleanup and consistency pass

**Goal:** make the repo easier to review.

**Do:**

* remove dead code
* align naming
* check scripts
* verify env docs

**Done when:**

* codebase feels intentional and reviewable

---

### [ ] D3-T08 Run final full test suite

**Goal:** verify nothing regressed before submission.

**Do:**

* run unit tests
* run integration tests
* run concurrency tests
* run at least one stress scenario
* manually test frontend flow

**Done when:**

* submission confidence is high

---

# Final Submission Checklist

* [ ] Source code is committed and pushed
* [ ] README explains design choices and trade-offs
* [ ] Architecture diagram is present
* [ ] Backend runs locally
* [ ] Frontend runs locally
* [ ] Unit tests pass
* [ ] Integration tests pass
* [ ] Concurrency tests pass
* [ ] Stress test instructions are documented
* [ ] Stress test result summary is documented
* [ ] Core guarantees are proven:

  * [ ] no overselling
  * [ ] one item per user
  * [ ] sale window enforced
  * [ ] sold-out behavior correct

---

# Progress Notes

## Risks / blockers

*
*
*

## Decisions made

* Redis is the operational concurrency gate
* Postgres stores durable purchase records
* purchase API is synchronous
* queue/outbox is documented as future production evolution
* frontend is intentionally minimal

## Things to explain in README/interview

* Why Redis instead of DB-only locking
* Why synchronous path instead of queue-first implementation
* How partial failure between Redis and Postgres would be improved in production
* Why the frontend is intentionally simple