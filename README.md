# CaseCellShop — Checkout Mini-Project (Part 1.B)

A runnable fullstack slice of the checkout journey described in [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md): a customer picks a product and a quantity, attempts a purchase, and the system guarantees it never oversells, never duplicates an order on retry/double-click, and always responds quickly even when the backend ERP is slow or unstable.

The repository holds three independent Node.js processes — `erp-mock/`, `backend/`, `frontend/` — no Docker or orchestration tool required.

## Prerequisites

- Node.js 20 LTS
- npm

## Install and run

Each package is installed and started independently, in its own terminal, in this order (the backend needs `erp-mock` reachable to process a checkout in the background, though its own startup doesn't block on it; the frontend needs the backend for any real data).

**1. ERP mock — port 4000**

```bash
cd erp-mock
npm install
npm run dev
```

**2. Backend — port 3001**

```bash
cd backend
npm install
npm run start:dev
```

**3. Frontend — port 5173**

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend's Vite dev server proxies `/api/*` to `http://localhost:3001` (see `frontend/vite.config.ts`), so the browser never talks to the backend's port directly — only through that proxy.

None of the three services need a `.env` file to run with defaults. `PORT` changes the port for `erp-mock`/`backend`; the backend also reads `ERP_MOCK_URL` (which `erp-mock` to call, default `http://localhost:4000`), and `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` (forwarded as headers to `erp-mock` to force a specific simulated ERP behavior — `always-success`/`always-fail`/`always-timeout`/`random` — instead of the default random behavior). These are how the e2e test suite points the backend at a dedicated test instance of `erp-mock` and drives each scenario deterministically; see `backend/test/global-setup.ts` and `backend/src/erp/infrastructure/http-erp.gateway.ts`.

## Running the tests

**`erp-mock/`** (Jest + Supertest, exercised directly against the Express `app`, no port binding needed):

```bash
cd erp-mock
npm test
```

**`backend/`** (Jest):

```bash
cd backend
npm test          # unit tests (*.spec.ts) — StockService and CheckoutUseCase business-rule branches
npm run test:e2e  # end-to-end tests (*.e2e-spec.ts) — full HTTP contract, incl. concurrency and idempotency
```

`npm run test:e2e` automatically spawns `erp-mock` as a child process before the suite runs and kills it afterward (`test/global-setup.ts` / `test/global-teardown.ts`, which poll `GET /health` before yielding control to the tests) — you do **not** need `erp-mock` already running in another terminal for this command specifically. It's still needed as a separately running process for the backend's own `start:dev`/manual use, and for the frontend flow above.

**`frontend/`** (Vitest + React Testing Library):

```bash
cd frontend
npm test
```

## Architecture and key technical decisions

The full reasoning behind every decision below lives in the project's spec-kit documents, linked at the end of this section — this README summarizes them, it doesn't replace them.

### Why `erp-mock` is a separate real HTTP service, not an in-process fake

The backend calls `erp-mock` over an actual network boundary (HTTP, its own process, its own port) instead of simulating ERP behavior with an in-process class. This is a deliberate risk-management choice, not incidental: an in-process fake can't exercise the failure modes that actually matter for this case's resilience criteria — connection resets, a timeout that really has to race the clock (`Promise.race` losing, not just the callee returning an error value), a slow response competing with the backend's own event loop. A real second process is also what forces `erp-mock`'s simulate mode to be **stateless and header-driven** rather than server-side config: two concurrent checkout attempts in the same test run can each demand different simulated behavior (`always-success` vs. `always-timeout`) without racing on shared mutable state, which is exactly the same isolation guarantee the original design got "for free" from reading `process.env` fresh on every call. See Task 2's design note in `specs/plan.md` for the full argument (the plan's separate **Risk Management** section covers a different, narrower concern: what happens operationally if `erp-mock`'s spawned test process fails to start).

`erp-mock` is explicitly exempt from the project's NestJS/DDD architecture mandate (see `specs/constitution.md`, "Stack and Technologies") — it's a test double standing in for a system outside this project's control, not part of the product being built, so a plain Express service is the honest choice for it.

### Backend DDD layering

The backend follows Domain-Driven Design, mandated by `specs/constitution.md` ("Architecture and Clean Code"). Each bounded context (`inventory/`, `orders/`, `checkout/`, `erp/`) is internally layered:

- **`domain/`** — entities with their own invariants (`Product.deduct()` never lets stock go negative; `Order.confirm()`/`fail()` are no-ops once a terminal status is already set), repository *interfaces* (ports, e.g. `ProductRepository`, `OrderRepository`), domain services (`StockService`), and domain errors (plain classes extending `DomainError`, with zero NestJS/HTTP imports).
- **`application/`** — use cases that orchestrate domain objects (`CheckoutUseCase`), holding no business rule of its own.
- **`infrastructure/`** — the concrete adapters behind each port: `InMemoryProductRepository`, `InMemoryOrderRepository`, `InMemoryStockReservationRepository`, and `HttpErpGateway` (the adapter that actually calls `erp-mock`).
- **presentation** (each module's `Controller` + DTOs) — HTTP routing only; no business rule and no domain-error-to-HTTP-status mapping lives in a controller. That mapping is centralized exactly once, in the global `HttpExceptionFilter`.

The idempotency cache (`IdempotencyService`) is the one deliberate exception to the port/adapter pattern — a single, disposable, purely technical piece of state with no plausible alternate implementation to swap in, so building a repository interface for it would be ceremony without purpose (YAGNI, per the constitution).

### In-memory storage instead of Redis

`referencias/decisoes-tecnicas.md`'s ADR-002 and ADR-003 describe Redis (a Lua script for stock reservation, a keyed cache for idempotency) as the real Phase 1 production design. This mini-project simplifies both to a single in-memory `Map` per concern, and that simplification preserves the same correctness guarantee that matters, not just a smaller footprint: Redis's Lua script guarantees the check-and-deduct stock operation runs as one indivisible step because Redis processes it without interruption from another client. A Node.js process gives the equivalent guarantee for free as long as the check-and-deduct code stays fully synchronous (no `await` between checking availability and reserving) inside a singleton service — the JavaScript event loop can never interleave two calls to the same synchronous function, so two concurrent requests for the last unit can never both "pass" the check. This equivalence is spelled out in `specs/spec.md`'s "Storage" decision, and the backend's concurrency e2e test (firing several simultaneous checkout attempts against a product with 1 unit in stock) is the regression guard for it.

### Why idempotency only caches the success response

A `POST /checkout` request that fails validation, or targets a nonexistent product, or hits insufficient stock, is a **pure function** of the current input and stock level — resending the exact same request recomputes the exact same answer, with no side effect to accidentally repeat. The one response that isn't pure is the `202 pending` success, because it has a side effect: it creates an order and reserves stock. That's the only branch that actually needs to be remembered against the `Idempotency-Key` — a resend of that same key returns the *original* order instead of creating a second one and double-reserving stock. See `specs/spec.md`'s "Idempotency" decision and ADR-003 in `referencias/decisoes-tecnicas.md` (this mini-project keeps the "cache the key" idea from that ADR but drops its 24h TTL, since there's no real persistence to protect in a short-lived demo process).

### Out of scope

Copied from `specs/spec.md`'s "Out of Scope" section:

- **Authentication, real payment, cloud deployment, mandatory Docker** — explicitly excluded by the case itself.
- **Multi-item cart** (ADR-007) — checkout stays single-item (`productId` + `quantity`) because the case describes the purchase journey in the singular throughout, and none of the evaluated criteria (stock consistency, idempotency, concurrency, error contract) depend on a cart; adding one would turn the single-product indivisible reservation into a multi-object write-skew problem requiring a redesign, not an extension.
- **Durable queue (RabbitMQ/BullMQ), a dedicated Postgres database, CDC** — these belong to Phases 2/3 of the incremental production plan (see `Parte 1.A — Perguntas Conceituais.md`, Question 2), not to this code mini-project.
- **A real automated reconciliation cron** (ADR-008) running as an actual scheduled process — documented here as a next step; `GET /orders/:id` already covers the immediate need for the customer (and an evaluator) to see an order's current status.
- **Formal contract tests (Pact) and load tests** — already documented in Question 5 of Part 1.A as a next step, not a priority for this deliverable.
- **A polished UI layout** — the case explicitly does not expect this.

## API contract (summary)

- `GET /products` — lists the seeded catalog with each product's *available* stock (base stock minus active reservations).
- `POST /checkout` — body `{ productId, quantity, idempotencyKey }` (the key may also be sent as the `Idempotency-Key` header). Returns `202` with `{ orderId, status: "pending", statusUrl }` on success; `400 VALIDATION_ERROR`, `404 PRODUCT_NOT_FOUND`, or `409 OUT_OF_STOCK` on failure.
- `GET /orders/:id` — current order status (`pending` | `confirmed` | `failed`, with `error: { code, message }` when `failed`); `404 ORDER_NOT_FOUND` for an unknown id.

The exact contract, including every field and status code, is defined in Question 4 of `Parte 1.A — Perguntas Conceituais.md` and restated precisely in `specs/spec.md`'s "`POST /checkout`" decision.

## Further reading

- [`specs/spec.md`](specs/spec.md) — the full behavioral spec: user stories, implementation decisions, data model, testing decisions, out-of-scope list.
- [`specs/constitution.md`](specs/constitution.md) — project governance: stack, code guidelines, DDD architecture mandate, testing rules.
- [`specs/plan.md`](specs/plan.md) — the task-by-task implementation plan, including Task 2's design note this README's `erp-mock` reasoning is drawn from.
- [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md) — the conceptual design doc this code implements a slice of (diagnosis, target architecture, concurrency/idempotency reasoning, API contract, testing strategy, AI usage).
- [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md) — the ADRs (ADR-001 through ADR-008) and the before/after risk matrix backing the conceptual answers.
- [`PROMPTS.md`](PROMPTS.md) — how AI was used to build this project.
