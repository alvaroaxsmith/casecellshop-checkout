# Project Constitution — CaseCellShop

This document is the project's highest authority. Any spec, plan, ADR, or line of code that conflicts with it must be corrected — or the conflict itself must become an explicit amendment to this constitution (see [Governance](#governance)), never a silent exception.

## Stack and Technologies

- **Runtime**: Node.js 20 LTS, pinned via `.nvmrc` and `package.json`'s `engines` field in every package — the same version in development and CI, so "works on my machine" is never caused by an engine mismatch.
- **Backend**: NestJS + TypeScript. Nest's modular architecture (feature modules) as the project's default structure — no single monolithic `app.ts`.
- **ERP mock**: a standalone, lightweight Express + TypeScript service in its own package (`erp-mock/`), simulating the external ERP as a real HTTP dependency the backend calls over the network — not an in-process fake. It is a test double for a system outside our control, not part of the product being built, so it is explicitly exempt from the NestJS/DDD architecture mandate below; it still follows every project-wide rule (TypeScript strict, no `any`, ESLint/Prettier, Semantic Commits with its own scope, e.g. `feat(erp-mock): ...`).
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
- **The backend follows Domain-Driven Design.** Every bounded context (a NestJS module, e.g. Inventory, Orders, Checkout) is internally layered:
  - **Domain**: entities (identity + invariants — e.g. an `Order` enforces its own valid state transitions instead of trusting the caller), value objects where a primitive would hide a rule, domain services for logic that spans more than one entity, repository *interfaces* (ports), and domain errors. Nothing in this layer imports NestJS's HTTP types, Express, or any framework transport concern — a domain error is a plain class, not an `HttpException`.
  - **Application**: use cases that orchestrate domain objects and repositories to fulfill one user-facing operation (e.g. `CheckoutUseCase`). A use case sequences calls; it does not itself contain business rules that belong on an entity or domain service.
  - **Infrastructure**: repository *implementations* (adapters) and gateways to external systems (e.g. the ERP simulator) — the concrete, swappable technology behind a domain port. In-memory today; the interface is what would let a real database or the real ERP replace it later without touching the domain or application layers.
  - **Presentation**: `Controller`s and DTOs. A controller only handles HTTP — routing, delegating to a use case, status code. No business rule and no domain-error-to-HTTP-status mapping lives inside a controller; that mapping is centralized once, in the global `ExceptionFilter`, which translates domain errors and DTO validation failures into the API's error contract.
  - Not every technical, non-business concern needs this full port/adapter ceremony (e.g. an idempotency cache) — reserve repository interfaces for things a real implementation could plausibly replace or that belong to the domain model; skip the abstraction for a single, disposable, purely technical implementation (YAGNI still applies inside DDD).
  - DTOs validate input *shape* (via `class-validator` and the global `ValidationPipe`) at the boundary; a business rule that must hold regardless of entry point belongs on the domain object, not only on the DTO.
- **File naming is kebab-case, consistently, across every layer** — the pattern is always `<kebab-case-name>.<type>.ts`, where `<type>` names the DDD/Nest role: `.entity.ts`, `.value-object.ts`, `.repository.ts` (interface/port), `.use-case.ts`, `.error.ts` (domain error), `.gateway.ts` (port to an external system), `.controller.ts`, `.module.ts`, `.dto.ts`. An infrastructure adapter is named after what it *is*, not a generic suffix — `in-memory-product.repository.ts`, `http-erp.gateway.ts` — so the file name alone tells you both the contract it fulfills and the technology behind it.
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

**Version**: 1.3.0 | **Ratified**: 2026-09-13 | **Last Amended**: 2026-09-13 — added the standalone `erp-mock` service and its exemption from the NestJS/DDD architecture mandate to Stack and Technologies.
