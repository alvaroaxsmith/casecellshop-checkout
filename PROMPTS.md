# PROMPTS.md — How AI was used to build this project

This document records how AI was used to build the CaseCellShop checkout mini-project (Part 1.B), per Question 6 of `Parte 1.A — Perguntas Conceituais.md` and the case's own checklist item asking for this record. It is not a transcript — the project was not built as one continuous back-and-forth chat. It was built through a **spec-driven, subagent-driven-development workflow**: a controller session that never wrote application code directly, dispatching a fresh implementer subagent per task, followed by an independent reviewer subagent and a fix loop, with every finding and ruling logged to a ledger (`.superpowers/sdd/plan/progress.md`) as it happened. This file summarizes that workflow and the substance of what was dispatched and found, task by task; the full detail (every finding, every commit hash) lives in that ledger for anyone who wants to audit the process itself.

## Overall workflow

1. **Constitution** (`specs/constitution.md`) — the governing document, written first: stack choices, DDD mandate, testing rules, security rules, git conventions. Any later decision that conflicts with it must either be corrected or become an explicit, logged amendment — never a silent exception.
2. **Spec** (`specs/spec.md`) — the behavioral spec for this mini-project, derived from the conceptual answers in `Parte 1.A — Perguntas Conceituais.md` and the ADRs in `referencias/decisoes-tecnicas.md`: user stories, implementation decisions (storage, idempotency, checkout flow), data model, testing decisions, and an explicit out-of-scope list.
3. **Plan** (`specs/plan.md`) — a task-by-task implementation plan derived from the spec, including a pre-flight cross-task consistency scan (checking that what one task produces is what a later task actually consumes, before any code was written) and a scoped risk-management table for this specific implementation.
4. **Per-task execution loop**, run once per task in the plan:
   - Dispatch a **fresh implementer subagent** with only that task's brief — no memory of other tasks, forcing the brief itself to carry all necessary context.
   - The controller does a **spot-check** of the diff (package-lock consistency, file structure) before review.
   - Dispatch an **independent reviewer subagent** against the task's brief and the project's spec/constitution, checking both "does it match the spec" and "is the task quality acceptable" (bugs, DDD-layering violations, `any` usage, dead code).
   - Findings are triaged: real defects go back to the **same implementer** (or a fresh one, if the original session is no longer reachable) for a fix round; findings that turn out to be false positives, or that trace back to a defect in the plan's own reference code rather than the implementer's work, are ruled on explicitly and logged, never silently dropped.
   - A **re-review** confirms each fix actually addressed the finding without introducing new breakage before the task is marked complete.
5. This file (`PROMPTS.md`) and `README.md` are Task 6, the last task in the plan — written once all five implementation tasks were complete, reviewed, and fixed.

The rationale for delegating repetitive code, tests, and documentation to AI while keeping architecture, stock/reservation/idempotency design, and concurrency logic under direct human decision is spelled out in Question 6 of `Parte 1.A — Perguntas Conceituais.md`; this project's controller/reviewer split is the concrete mechanism that enforces "verify, don't just accept" for exactly those high-risk areas — the concurrency guarantee and the idempotency cache were independently re-derived and checked by a reviewer subagent in Task 3, not just implemented once and trusted.

## Per-task summary

### Pre-flight scan

Before dispatching Task 1, the controller cross-checked every producer/consumer interface pair across all six tasks in `specs/plan.md` (e.g., does Task 3's `CheckoutUseCase` consume exactly what Task 1's `StockService` produces?) and found one stale line: Task 3's file list wrongly implied `http-exception.filter.ts` needed editing, when Task 1 already wrote its final form. Fixed directly in the plan before any implementer saw it.

### Task 1 — Backend scaffold, Inventory domain, `GET /products`

Dispatched: scaffold the NestJS backend, the Inventory bounded context (`Product` entity, `StockService` domain service, in-memory repositories), and `GET /products`, all DDD-layered per the constitution.

- The implementer hit a real compile failure with the brief's specified `import request from "supertest"` and worked around it locally; investigation traced the actual cause to a plan defect (`tsconfig.json` had `allowSyntheticDefaultImports` but not `esModuleInterop`) — fixed in both the code and the plan, and the implementer's workaround was reverted in favor of the (now-correct) original import style.
- Review found a real defect (`package-lock.json` didn't match the committed `package.json`, which would break `npm ci`) — fixed by regenerating the lockfile.
- Review also flagged `StockService` importing `@Injectable`/`@Inject` from `@nestjs/common` inside `domain/` as a possible violation of "no framework imports in the domain layer." Ruled not a defect: the constitution's actual rule forbids HTTP/transport-concern imports in the domain layer, not NestJS's dependency-injection decorators, which carry no transport concern — the reviewer's checklist had been phrased more strictly than the source rule.
- Added a missing root `.gitignore` (`node_modules/`, `dist/`, `.env*`) as a safety hygiene fix, unrelated to functional code.

### Task 2 — ERP mock service (`erp-mock/`)

Dispatched: a standalone Express service simulating the ERP as a real external HTTP dependency, with per-request-header-driven behavior (`always-success`/`always-fail`/`always-timeout`/`random`, configurable delay) so tests can force deterministic ERP behavior without server-side state that could leak between concurrent requests.

- Clean implementation; the implementer explicitly re-checked package-lock consistency this time, avoiding a repeat of Task 1's bug class.
- Review approved with two deferred minor findings, both traced to the plan's own reference code rather than implementer deviation (an unchecked type assertion on the simulate-mode header that harmlessly falls through to the random branch on bad input, and a missing `tsconfig` `exclude` that lets `tsc` also compile the test file into `dist/`).

### Task 3 — Checkout core (`POST /checkout`, `GET /orders/:id`)

The highest-risk task: stock reservation, idempotency, and ERP resilience all live here. Dispatched as one task rather than split further, since a reviewer can't meaningfully approve "checkout accepts valid input" while rejecting "checkout rejects invalid input" for what is a single endpoint's contract.

- The implementer reported a non-deterministic Jest worker-exit warning in some e2e runs, investigated and attributed to `undici` connection-pool keep-alive sockets rather than a real resource leak.
- Review found one **critical** defect, traced back to the plan's own reference code: `CheckoutUseCase`'s background ERP call used `Promise.race` with no `try`/`catch` around the network call — any transport-level rejection (connection reset, erp-mock down) would become an unhandled promise rejection and crash the Node process under Node 20's default settings, and would also silently zero out the retry budget for the most likely real-world failure class. This was invisible to the existing test suite because `global-setup.ts` guarantees `erp-mock` is healthy before every test runs.
- Review also found an **important** style violation: four `as any` casts in the unit test file, unnecessary since the literal test objects already satisfied the DTO's actual (partially optional) shape — violating the constitution's blanket ban on `any`.
- Both fixes were applied to the plan's reference code and then to the actually committed implementation: wrapped the ERP call in `try`/`catch` (a rejection now counts as a failed attempt, preserving the retry budget), added a defensive `.catch()` on the fire-and-forget background call, added a response-status check in the HTTP gateway before parsing JSON, and removed the `any` casts.
- Re-review confirmed both fixes without new breakage. Several minor findings were deferred to a final whole-branch pass (no `AbortController` actually canceling the in-flight fetch on timeout, unbounded in-memory `Map` growth accepted as an explicit demo-scope limitation, edge cases in the test teardown's process-kill logic, and a few small architectural nitpicks) — none blocking, all logged.

### Task 4 — Frontend scaffold and product list

Dispatched: Vite + React + TypeScript scaffold and the initial product-list screen (no Next.js, per the constitution).

- Clean implementation and clean review — zero findings, the only task in the project that closed without a fix round.

### Task 5 — Frontend checkout flow

Dispatched: the buy button, quantity input, loading/status/error states, and polling of `GET /orders/:id`.

- The implementer changed several of the brief's `getByRole(...)` test assertions to `getAllByRole(...)[index]`, attributing it to React Strict Mode double-rendering. Review verified this diagnosis was **incorrect**: the actual cause was that `frontend/test/setup.ts` never called React Testing Library's `cleanup()` between tests, so DOM nodes from earlier tests in the same file accumulated — the workaround happened to pass only because every stale mounted component behaved identically under the same mocks, not because the test was actually exercising the intended single instance.
- The correct, in-scope fix (adding `afterEach(cleanup)` to the test file, which the brief already authorized editing) was applied by a newly dispatched implementer, since the original implementer's session was no longer reachable for a direct follow-up. All five assertions were reverted to the brief's original singular `getByRole` form once the real cause was fixed.
- Re-review confirmed the fix and confirmed the change stayed scoped to the test file only.

### Task 6 — README and PROMPTS.md (this task)

Documentation only, no application code. Wrote `README.md` (install/run/test instructions for all three packages, and the reasoning behind the `erp-mock`-as-real-service, DDD-layering, in-memory-storage, and idempotency-caching decisions, sourced from `specs/spec.md`, `specs/constitution.md`, and `specs/plan.md`) and this file, sourced from the `.superpowers/sdd/plan/progress.md` ledger rather than reconstructed from memory.
