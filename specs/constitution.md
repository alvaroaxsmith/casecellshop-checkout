# Project Constitution — CaseCellShop

This document is the project's highest authority. Any spec, plan, ADR, or line of code that conflicts with it must be corrected — or the conflict itself must become an explicit amendment to this constitution (see [Governance](#governance)), never a silent exception.

## Stack and Technologies

- **Runtime**: Node.js 20 LTS or newer, pinned via a single `.nvmrc` at the repo root — the same version in development and CI, so "works on my machine" is never caused by an engine mismatch.
- **Backend**: NestJS + TypeScript. Nest's modular architecture (feature modules) as the project's default structure — no single monolithic `app.ts`.
- **ERP mock**: a standalone, lightweight Express + TypeScript service in its own package (`erp-mock/`), simulating the external ERP as a real HTTP dependency the backend calls over the network — not an in-process fake. It is a test double for a system outside our control, not part of the product being built, so it stays a plain Express app instead of a second NestJS service; it still follows every project-wide rule (TypeScript strict, no `any`, ESLint/Prettier, Semantic Commits with its own scope, e.g. `feat(erp-mock): ...`).
- **Frontend**: React + TypeScript, **without Next.js**. Build tool: Vite. Routing (when needed): React Router, not Next's file-based routing.
- **Backend tests**: Jest (Nest's default tool) — `*.spec.ts` for unit tests, `*.e2e-spec.ts` for end-to-end tests via `supertest`.
- **Frontend tests**: Vitest + React Testing Library.
- **Package manager**: a single one, pinned in `package.json` (`"packageManager"`), the same across the whole monorepo — never mix `npm`/`yarn`/`pnpm` between backend and frontend.
- **Lint/format**: ESLint (`@typescript-eslint`, strict rules) + Prettier. Formatting is never up for debate in code review — if Prettier allows it, it's correct.

## Code Guidelines

- Always use TypeScript in strict mode (`strict: true`, plus `noUncheckedIndexedAccess` and `noImplicitOverride` enabled).
- `any` is forbidden. Use `unknown` when needed, with explicit narrowing.
- Follow **Semantic Commits** (Conventional Commits): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `style:`, `perf:`, `build:`, `ci:`. Add a scope in parentheses when it helps (`feat(checkout): ...`).
- Variable, function, and file names in English; user-facing text (messages, labels) in Portuguese — never mix the two within the same kind of content.
- No dead code, no forgotten `console.log`, no unused imports — the linter enforces this, not manual review.
- Every environment variable is declared and validated at startup (a schema with `class-validator`/`zod`), never read directly from `process.env` scattered across the code.

## Architecture and Clean Code

- Functions must not exceed 30 lines. If they do, refactor.
- One module, one responsibility — if a file grows to cover two different concerns, it becomes two files.
- **The backend uses a simple, flat layering — deliberately not full Domain-Driven Design.** This is a mini-project with a small, well-understood scope; a tactical DDD split (entities with invariant-enforcing methods, value objects, repository ports/adapters, application-layer use cases) is real overhead — extra files, extra indirection, extra reading — that pays for itself on a large or long-lived codebase and doesn't here. Every NestJS module (`Products`/`Orders`/`Checkout`/`Idempotency`/`Erp`) is just:
  - **`Controller`**: routing only — reads the request, calls the service, returns what it gives back (or lets a thrown exception reach the global filter). No business rule and no error-to-HTTP-status branching lives here; that mapping is centralized once, in the global `ExceptionFilter`.
  - **`Service`**: the business logic and the data it operates on, together. A service can hold its state directly (an in-memory `Map`/array) — there is no separate repository interface to implement, because there is nothing here a second, real implementation would plausibly replace *within this mini-project's scope*. If that ever changes (a real database, a real ERP), extracting an interface at that point is a normal, cheap refactor — not something to pre-build now on the chance it's needed.
  - **`Module`**: wires the controller and service(s) together via NestJS's dependency injection, and imports the other modules it depends on.
  - **DTOs** validate input *shape* (`class-validator` + the global `ValidationPipe`) at the boundary. A business rule that must hold regardless of entry point (e.g. "stock can't go negative") is checked in the service, not only in the DTO.
  - Domain-specific failures are still typed exceptions (e.g. `ProductNotFoundException`, `OutOfStockException`), not generic `Error`s or ad-hoc status codes scattered through services — they just extend Nest's `HttpException` directly instead of a separate framework-agnostic error hierarchy, since there is no other transport this API is meant to serve.
  - Use the domain's real vocabulary in names (`reserveStock`, `settleWithErp`, `idempotencyKey`) instead of generic CRUD naming (`update`, `process`) — that's the part of DDD's thinking worth keeping even without its tactical patterns.
- **File naming is kebab-case, consistently** — the pattern is `<kebab-case-name>.<type>.ts`: `.controller.ts`, `.service.ts`, `.module.ts`, `.dto.ts`, `.exception.ts`.
- **On the frontend (React)**:
  - UI components stay strictly separated from business logic — fetch/state/rule logic goes into custom hooks (`useCheckout`, `useProducts`); the component only renders.
  - Functional components with hooks only. No class components.
  - HTTP calls go through a single API layer (e.g. `api/client.ts`), never `fetch` scattered inside components.
- Prefer composition over inheritance, dependency injection over direct instantiation (`new`) inside services.
- YAGNI: don't build an abstraction for a hypothetical use case. Three similar lines in two places isn't automatic grounds for extracting a function — only extract when the duplication is real and repeated.

## Testing

- Every new or changed business rule has a test covering its observable behavior (input → output), never an internal implementation detail.
- Backend: unit test of the `Service` (Jest, mocked dependencies) + at least one `e2e` test per endpoint covering the real HTTP contract (`supertest`).
- Frontend: component test covering states (loading, success, error) via real user interaction (`@testing-library/user-event`), never inspecting the component's internal state.
- `npm run test` (or the package's equivalent) must pass before any commit — see [Agent Behavior](#agent-behavior-claude).
- Concurrency scenarios in critical rules (e.g. stock) have a dedicated test firing simultaneous requests — a sequential "happy path" test alone is not enough.

## Security

- Never commit a secret, key, or credential — use environment variables and `.env` in `.gitignore`.
- Every external input (body, query, params, headers) is validated before touching any business logic.
- Dependencies with a known vulnerability (`npm audit` / Dependabot) get updated, not silenced.
- Errors returned to the client never leak a stack trace, SQL query, or infrastructure detail — a friendly message for the client, detailed logging only on the server.

## Documentation

- Every architecturally significant technical decision becomes an ADR (Title, Status, Context, Decision, Consequences) — it doesn't stay only in the decider's head or get lost in chat history.
- A README at the root of each package (`backend/`, `frontend/`) explains how to install, run, and test that specific package.
- Specs, plans, and ADRs that reference each other (relative links) must stay coherent when one of them changes — updating one without reviewing who references it counts as incomplete work.

## Git and Version Control

- No direct commits to `main`/`master` beyond trivial documentation — code work goes through a branch + review.
- Branches named by type/scope: `feature/<name>`, `fix/<name>`, `chore/<name>`.
- Small, frequent commits, each leaving the project in a state that builds and tests — not one giant commit at the end of the task.
- Never `--force` push to a shared branch, nor `git reset --hard`/`git clean -fdx` without first confirming there's no uncommitted work at risk.

## Agent Behavior (Claude)

- Run the affected package's test suite after creating or modifying any file, and make sure it passes before considering the task done.
- Never delete `TODO`/`FIXME` comments left by humans.
- If a bug outside the current task's scope is found, don't fix it unilaterally — flag it in chat or record it as a next step, and stay focused on the requested task.
- Never leave a spec, plan, ADR, or this document itself outdated after a change that invalidates it — coherence between documentation and code is part of the definition of done, not an extra.
- When making a non-trivial technical decision without explicit user confirmation, record why (in an ADR, a comment, or the reply to the user) — never decide silently on something that could have been asked.
- Never perform a destructive or irreversible action (force push, `reset --hard`, deleting a relevant branch/file, dropping data) without explicit user confirmation for that specific action.
- Prefer the smallest diff that solves the task — no "bonus" refactoring beyond what was asked.

## Governance

This constitution takes precedence over any older conflicting practice. Changes require:

1. An explicit record of what changed and why (in this section or in a referenced ADR).
2. Updating any spec/plan/document that depends on the changed rule, in the same change — not afterward.

**Version**: 2.0.0 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-14 — replaced the Domain-Driven Design architecture mandate with a simpler flat Controller/Service/Module layering, judged a better fit for this mini-project's scope; the backend was rewritten from scratch to match (see git history for the DDD version this superseded).
