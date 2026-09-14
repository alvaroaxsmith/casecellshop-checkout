# Spec — Part 1.B: Checkout Mini-Project (CaseCellShop)

Derives directly from [`Parte 1.A — Perguntas Conceituais.md`](../Parte%201.A%20—%20Perguntas%20Conceituais.md) and the decisions recorded in [`referencias/decisoes-tecnicas.md`](../referencias/decisoes-tecnicas.md) (ADR-001 through ADR-008).

## Problem Statement

A CaseCellShop customer wants to buy a phone case on the website. Today, this journey can fail in confusing ways: a purchase can be accepted even when there's no stock available, a double click or a network failure can create two orders for the same purchase attempt, and if the backend system (ERP) takes too long to respond, the customer is left not knowing whether the purchase went through. It needs to be shown, in a runnable mini-project, that this journey can be implemented reliably — never selling beyond available stock, never duplicating orders, and always giving the customer a clear response about what's happening.

## Solution

A single-item fullstack checkout flow: the customer sees a product list, picks a product and a quantity, and attempts to complete the purchase. The backend reserves stock as an indivisible operation before making any call to the simulated ERP, responds to the customer quickly, and finishes processing in the background — with a clear simulation of ERP slowness/instability. Each purchase attempt carries a unique key (idempotency), preventing duplication on retry or double-click. The front-end shows loading, disables the button while processing, and displays specific messages for each type of error.

## User Stories

**Purchase — main flow**

1. As a customer, I want to see a list of products with price and stock, so I can decide what to buy.
2. As a customer, I want to enter a quantity for a chosen product, so I can specify how many units I want to buy.
3. As a customer, I want to attempt a purchase and get a clear response, so I know whether it was accepted, rejected, or is still being processed.
4. As a customer, I want invalid quantities (zero, negative, non-numeric) to be rejected with a clear message, so I can fix my request instead of getting a generic error.
5. As a customer, I want to be told when a product doesn't exist, so I understand my request was wrong, not that the system failed.
6. As a customer, I want to be prevented from buying more than the available stock, so I never pay for something that doesn't exist.
7. As a customer, I want a resent purchase attempt (network failure, double click) to never create two orders, so I don't risk being charged/counted twice.
8. As a customer, I want checkout to respond quickly even if the backend system is slow, so I don't wait indefinitely for a response.
9. As a customer, I want to be able to check my order status after it's been accepted, so I know when it's confirmed or if it failed.

**Simulation and concurrency (technical evaluation)**

10. As an evaluator, I want the ERP to be simulated with visible, configurable slowness/instability, so I can observe the checkout's resilience behavior.
11. As an evaluator, I want the stock check and deduction to happen as a single indivisible operation, so I can confirm that two concurrent purchases of the last unit are never both accepted.
12. As an evaluator, I want a test that fires several simultaneous purchase attempts for a product with 1 unit in stock, so I can confirm only one succeeds.
13. As an evaluator, I want resending the same purchase attempt (same idempotency key) to return the exact same response without reprocessing anything, so I can confirm idempotency really works.

**Front-end**

14. As a customer, I want to see a simple screen listing the products, so I can choose what to buy.
15. As a customer, I want to choose a quantity before buying, so I control how many units I acquire.
16. As a customer, I want the buy button to disable as soon as I click it, so I can't accidentally submit the same purchase twice.
17. As a customer, I want to see a loading indicator while my purchase is being processed, so I know the system is working on my order.
18. As a customer, I want to see a clear success message when my purchase is confirmed, so I know the transaction went through.
19. As a customer, I want to see a clear message when the product is out of stock, so I understand why my purchase didn't go through.
20. As a customer, I want to see a clear message when my input is invalid, so I can fix it and try again.
21. As a customer, I want to see a clear message when there's a temporary processing failure, so I know to try again later instead of thinking I did something wrong.
22. As a customer, I want the screen to remain in a coherent state after an error or retry, so I'm not confused about what happened to my purchase.

**Quality and delivery**

23. As an evaluator, I want a README explaining how to install and run the project, so I can evaluate it without guesswork.
24. As an evaluator, I want the README to explain technical decisions, limitations, and next steps, so I understand the reasoning behind the implementation.
25. As an evaluator, I want automated tests covering the main scenarios, so I can trust the described behavior without having to manually retest everything.
26. As an evaluator, I want the code organized in an understandable way, so I can review it efficiently.
27. As an evaluator, I want a `PROMPTS.md` recording the relevant prompts used during development, so I understand how AI was used.

## Implementation Decisions

- **Stack**: NestJS + TypeScript on the backend, structured as a flat `Controller`/`Service`/`Module` per feature (`products/`, `orders/`, `checkout/`, `idempotency/`, `erp/`) — deliberately not Domain-Driven Design — React + TypeScript (Vite, no Next.js) on the front-end, and a standalone lightweight Express service simulating the ERP as a real external HTTP dependency — per the project [constitution](constitution.md), which has the full rationale for the flat layering.
- **Storage**: everything in memory, inside a single process-state module — no Redis, no real database. This is a deliberate simplification of ADR-002/ADR-003 (which describe Redis for the real Phase 1): since Node.js processes one synchronous critical section at a time, an in-memory `Map` with check-and-deduct inside a single synchronous function gives the same indivisible-operation guarantee that Redis's Lua script provides — without requiring the infrastructure. This equivalence must be made explicit in the README, not hidden as a limitation.
- **Catalog**: a product list seeded in memory at startup (id, name, price, stock).
- **`GET /products`**: lists the products and their available stock (actual stock minus active reservations).
- **`POST /checkout`**: contract exactly as defined in Question 4 of Part 1.A — payload (`productId`, `quantity`, `idempotencyKey`), success `202` with `status: pending`, validation error `400`, product not found `404`, insufficient stock `409`.
- **Stock reservation**: balance check and unit deduction as a single synchronous operation, with a 2-minute expiration (ADR-002) checked by timestamp (no native Redis TTL, since it's an in-memory `Map`).
- **ERP simulator**: a separate, standalone HTTP service (`erp-mock/`) — not an in-process fake — that, when called, waits a delay (configurable) and responds with success or failure, simulating slowness/instability of a real external system the backend has no control over. Its behavior is driven entirely by per-request headers (never server-side state), so it must have a deterministic mode switchable per call, so tests can force success, failure, or timeout without depending on randomness and without one test's configuration leaking into a concurrent one.
- **Checkout flow**: `POST /checkout` always responds `202 pending` immediately as soon as the stock reservation succeeds — it never waits for the ERP to respond before returning the HTTP response, even if the simulated ERP responds within a few milliseconds. The attempt against the simulated ERP (3s timeout per attempt, ADR-004) happens entirely in the background, with up to 3 attempts and backoff — the same logic as ADR-004, without a real queue. This uniformity is deliberate: the `POST /checkout` contract never varies with ERP speed, and the `confirmed`/`failed` states only ever appear via `GET /orders/:id`, never inline in the `POST /checkout` response.
- **`GET /orders/:id`**: returns the order's current status (`pending`, `confirmed`, `failed`), with the `ERP_PROCESSING_FAILED` error body when applicable — this is an explicit bonus item in the case's checklist. An `id` that doesn't exist returns `404` with `errorCode: ORDER_NOT_FOUND`.
- **Idempotency**: `idempotencyKey` is required — sent either in the payload or in the `Idempotency-Key` header (faithful to Question 4 of Part 1.A's original contract, which allows both forms). A request with neither is a `VALIDATION_ERROR` (400, field `idempotencyKey`). Only the **success** response (`202`) is cached against the key, mapping to the order it created; a repeated key returns that same order info without creating a second reservation (ADR-003, without the 24h TTL since there's no real persistence to protect in a short-lived process). Validation, not-found, and out-of-stock responses are **not** cached — they're pure functions of the current input/state, so recomputing them on retry naturally gives the same answer without needing a cache; the only case that actually needs caching is the one with a side effect (creating an order and reserving stock) that a retry must not repeat.
- **Front-end**: a single screen with a product list, quantity selection, a buy button that disables on click, a status/error area, and polling of `GET /orders/:id` while the order is `pending`.

## Data Model

The entities involved in this flow, and the fields that matter to the case:

- **Product**: `id`, `name`, `priceCents`, `stock` (base quantity owned) — `GET /products` reports `stock` as *available* stock (base minus active reservations), never the raw base quantity, so a customer never sees a number they could still overbuy against.
- **Order**: `id`, `productId`, `quantity`, `status` (`pending` | `confirmed` | `failed`), `errorCode?`, `errorMessage?`, `createdAt` — `confirmed` and `failed` are the only terminal statuses, and once either is set it never changes again.
- **Stock reservation** (internal bookkeeping, never exposed through an endpoint): `orderId`, `productId`, `quantity`, `status` (`active` | `confirmed` | `released`), `expiresAt` — this exists only to make "how much is actually available right now" answerable while an order is still `pending`; it isn't part of the product or order the customer ever sees directly.

This shape is intentionally independent of storage technology — the fields are dictated by what the business needs to know (see `Implementation Decisions` → `Storage` for why in-memory is sufficient here), not by whether it's a `Map` today or a real database later.

## Testing Decisions

- A good test here checks externally observable behavior, never internal implementation (it must not inspect a service's internal `Map` directly, for example).
- **Backend, end-to-end** (seam: the API's HTTP boundary, Jest + supertest, `*.e2e-spec.ts`): success, validation error (including a missing `idempotencyKey`), product not found, insufficient stock, concurrency (N simultaneous requests for a product with 1 unit — only one succeeds), resending the same `idempotencyKey` (via payload and via the `Idempotency-Key` header), simulated ERP failure via both the fast path (`always-fail`) and the timeout path (`always-timeout`, which exercises `Promise.race` losing to the clock, not just the ERP responding negatively) — using the simulator's deterministic mode. This is the primary seam and covers every scenario in the case's checklist.
- **Backend, unit** (Jest, `*.spec.ts`, mocked/faked collaborators — required by the project [constitution](constitution.md) on top of the e2e seam above): the two services that hold actual business rules — `ProductsService` (reservation only succeeds while there's enough available; release restores availability without touching base stock; confirmation permanently deducts it) and `CheckoutService` (each error branch throws the right domain exception; a cached idempotency key short-circuits before creating a new order). `OrdersService`, `IdempotencyService`, and `ErpService` are plain data holders/adapters with no branching logic of their own — they're exercised through the e2e tests and don't get redundant isolated unit tests of their own.
- **ERP mock, its own tests** (seam: the mock's own HTTP boundary, Jest + supertest, run against the Express `app` directly — no live port needed): one test per simulate mode (`always-success`, `always-fail`, `always-timeout`), one proving the requested delay is actually honored, and one proving the header-less default (`random`) still returns a well-formed response. This is what lets the backend's e2e suite trust the mock without re-testing its internals.
- **Front-end** (seam: React component, Vitest + React Testing Library): loading, button disabled while processing, and the correct message rendered for each possible API response (mocking only the HTTP call, not the UI logic).
- The e2e/component seams were already committed to in Question 5 of Part 1.A; the unit-test layer for backend services is an addition required by the constitution once the stack moved to NestJS, and doesn't replace or duplicate the e2e coverage.

## Out of Scope

- Authentication, real payment, cloud deployment, mandatory Docker — explicitly excluded by the case.
- Multi-item cart (ADR-007) — checkout stays single-item.
- Durable queue (RabbitMQ/BullMQ), dedicated Postgres database, CDC — belong to Phases 2/3 of the incremental plan, not to the code mini-project.
- Real automated reconciliation cron (ADR-008) running as an actual scheduled process — documented as a next step in the README; the order status endpoint (`GET /orders/:id`) covers the immediate visibility need.
- Formal contract tests (Pact) and load tests — already documented in Question 5 of Part 1.A as a next step.
- Polished layout — the case explicitly does not expect this.

## Further Notes

- The implementation must remain consistent with the decisions already recorded in `referencias/decisoes-tecnicas.md`, adapting only the conceptual infrastructure (Redis → memory) as allowed by the mini-project's scope — any divergence in numbers (2 min TTL, 3s timeout, up to 3 attempts) must be justified, not silent.
- The repository holds three local Node processes, not two: `erp-mock/`, `backend/`, `frontend/`. No Docker or orchestration tool is required to run any of them — each is started with a plain `npm run dev`/`start:dev` in its own terminal (see `plan.md`'s File Structure), and the backend's own e2e test suite starts and stops `erp-mock` automatically, so an evaluator running `npm run test:e2e` never needs to remember to start it by hand.
- `PROMPTS.md` must be kept up to date during development, recording the relevant prompts.
- There is no issue tracker configured in this project (`/setup-matt-pocock-skills` was not run); this spec lives as a file in the repository instead of being published to an external tool.
