# CaseCellShop Checkout (Part 1.B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fullstack checkout mini-project described in the case (Part 1.B): a product list, a one-item-at-a-time checkout that never oversells, is idempotent under retry/double-click, and stays responsive even when the simulated ERP is slow or unstable.

**Architecture:** Three independent packages in this repo — `erp-mock/` (a standalone Express + TypeScript service simulating the ERP as a real external HTTP dependency, stateless and driven entirely by per-request headers), `backend/` (NestJS + TypeScript, Domain-Driven Design layering inside each bounded context, all state in memory), and `frontend/` (Vite + React + TypeScript, no Next.js). The backend exposes three endpoints (`GET /products`, `POST /checkout`, `GET /orders/:id`) across three bounded contexts (Inventory — product + stock, Checkout, Orders) and reaches `erp-mock` over HTTP through its own gateway; the frontend is a single page that lists products, submits a checkout attempt, and polls order status until it resolves — it never talks to `erp-mock` directly.

**Tech Stack:** Node.js + TypeScript (NestJS, Jest, Supertest) for the backend; a standalone Express + TypeScript service (Jest, Supertest against the Express app directly) for the ERP mock; React + TypeScript (Vite, Vitest, React Testing Library) for the frontend — per the project [constitution](constitution.md).

**Spec:** [`spec.md`](spec.md) — this plan implements it in full; executors should read both, and both are bound by [`constitution.md`](constitution.md).

## Global Constraints

- Reservation TTL: 2 minutes, sized to cover the ERP retry window (SPEC "Stock reservation").
- ERP call timeout: 3 seconds per attempt, up to 3 attempts total, with backoff between attempts (SPEC "Checkout flow").
- `Idempotency-Key` is required on every `POST /checkout` call — via the JSON body (`idempotencyKey`) or the `Idempotency-Key` header; a missing key is a `VALIDATION_ERROR`. Only the success response is cached against the key (SPEC "Idempotency") — error responses are recomputed fresh every time, since they're pure functions of the input/state and need no cache.
- Error contract is fixed: `VALIDATION_ERROR` (400), `PRODUCT_NOT_FOUND` (404), `OUT_OF_STOCK` (409), `ERP_PROCESSING_FAILED` (200 via `GET /orders/:id`), `ORDER_NOT_FOUND` (404, `GET /orders/:id` for an unknown order id) — exact codes, no deviation (SPEC "`POST /checkout`").
- Storage is in-memory only — no Redis, no real database (SPEC "Storage"). No authentication, no real payment, no Docker requirement, no cloud deploy (SPEC "Out of Scope").
- Checkout stays single-item: `productId` + `quantity`, no cart (SPEC "Out of Scope", ADR-007).
- The backend follows Domain-Driven Design: business rules live on entities/domain services, never on a controller; a domain error is a plain class, never an `HttpException` (Constitution "Architecture and Clean Code"). All input validation goes through DTOs (`class-validator`) and the global `ValidationPipe`; every error response — DTO validation failure or thrown domain error — is mapped to its HTTP status exactly once, in the global `HttpExceptionFilter` — no manual status-code branching inside a controller.
- File naming is kebab-case across every layer, with the type suffix naming the DDD/Nest role (`.entity.ts`, `.repository.ts`, `.use-case.ts`, `.error.ts`, `.gateway.ts`, `.controller.ts`, `.module.ts`, `.dto.ts`) — Constitution "Architecture and Clean Code".
- Backend tests: `*.e2e-spec.ts` (Jest + supertest) covering the full HTTP contract is the primary seam; `*.spec.ts` (Jest, mocked/faked collaborators) is required only for the two places that hold actual branching business logic — `StockService` (inventory domain service) and `CheckoutUseCase` (checkout application service) (Constitution "Testing"; SPEC "Testing Decisions"). Frontend tests assert on rendered component output only (SPEC "Testing Decisions").

---

## Risk Management

Risks specific to *this implementation* — not the production Phase 1/2/3 risk matrix in `referencias/decisoes-tecnicas.md`, which covers a different scope entirely:

| Risk | Impact if ignored | Mitigation |
|---|---|---|
| Decorator metadata mismatch between `tsconfig.json` and Jest's `ts-jest` transform | Dependency injection silently resolves `undefined` instead of failing loudly, producing confusing runtime errors far from the actual cause | `experimentalDecorators`/`emitDecoratorMetadata` are set once, in `tsconfig.json` (Task 1, Step 3); both `jest` (unit, via `package.json`) and `test/jest-e2e.json` (e2e) reuse `ts-jest`, which reads that same file — never duplicate these flags in a test-only config |
| The ERP-timeout e2e test (Task 3, Step 20) takes ~12.5s of real wall-clock time | Repeating this pattern across more products/scenarios would make the suite slow enough to discourage running it locally, defeating its own purpose | Keep it to exactly one scenario proving the timeout-race branch; every other ERP-related test uses `always-success`/`always-fail` with a short delay instead |
| Reliance on Node's single-threaded synchronous execution for the stock-reservation critical section (ADR-002) | If the reservation logic ever gained an `await` before the check-and-reserve step, or the app were later split into worker threads/multiple processes without a shared store, the "only one wins" guarantee would silently break | `StockService.reserveStock` (Task 1, Step 12) must stay synchronous end-to-end, by design; Task 3's concurrency test (Step 16) is the regression guard — if it ever passes only sometimes, that's the guarantee breaking, not flakiness to retry away |
| In-memory state lives inside singleton providers for the lifetime of one Jest worker process | Tests that assume a specific starting stock level (e.g. `capinha-listrada` starting at exactly 1 unit) could interfere with each other if duplicated or reordered within the same file | `products.e2e-spec.ts` and `checkout.e2e-spec.ts` each boot their own `createTestApp()` in `beforeAll`, so state never crosses file boundaries; the last-unit concurrency test is written to run exactly once per process and must not be duplicated elsewhere in the same file |
| `erp-mock` is a separately spawned process for the e2e suite (Task 3, Step 6) | If it fails to start, or starts slowly, every checkout e2e test fails with a confusing timeout unrelated to the actual behavior under test — and even `products.e2e-spec.ts`, which never touches the ERP, pays a small shared startup cost since `globalSetup` runs once for the whole e2e config | `global-setup.ts` polls `/health` before yielding control to the test suite and throws a clear, specific error if `erp-mock` never becomes healthy, instead of letting individual tests time out mysteriously; the shared startup cost is accepted as a small, fixed price for keeping `npm run test:e2e` a single command |

Broader production risks (durable queue needed at scale, Postgres migration, real ERP integration failure modes) are already covered in `referencias/decisoes-tecnicas.md`'s risk matrix and are explicitly out of scope for this mini-project (see `spec.md` "Out of Scope") — this table stays short by design, scoped only to what could actually go wrong while building *this* code.

---

## File Structure

Domain-Driven Design layering inside each bounded context, per the [constitution](constitution.md): `domain/` (entities, value objects, repository *interfaces*, domain services, domain errors — zero NestJS/HTTP imports), `application/` (use cases orchestrating the domain), `infrastructure/` (repository/gateway *implementations*), and the module root (`Controller`, `Module`, DTOs — the presentation layer). File names are kebab-case and end in the role they play: `.entity.ts`, `.repository.ts`, `.use-case.ts`, `.error.ts`, `.gateway.ts`.

```
backend/
  package.json
  tsconfig.json
  tsconfig.build.json
  nest-cli.json
  src/
    main.ts                                  Bootstraps the Nest app, applies configureApp(), listens
    bootstrap.ts                             configureApp(app): wires the global ValidationPipe + HttpExceptionFilter
    app.module.ts                            Root module — imports InventoryModule, CheckoutModule, OrdersModule
    shared/
      domain/
        domain-error.ts                      Abstract base class every domain error extends (code + message + optional field)
        errors/
          invalid-input.error.ts             Generic VALIDATION_ERROR (code, message, field) — reused by DTO shape failures and by the missing-idempotencyKey business rule
      presentation/
        filters/
          http-exception.filter.ts           The one place domain-error codes map to HTTP status; also handles Nest's own HttpException and unknown errors
    inventory/                                Bounded context: product catalog + stock availability (see below for why they're one context)
      domain/
        product.entity.ts                    Product — id, name, priceCents, and its own stock, with a deduct() that enforces it never goes negative
        product.repository.ts                Port (interface) + injection token PRODUCT_REPOSITORY
        stock-reservation.entity.ts           A reservation's own lifecycle: active → confirmed | released, plus isExpired()
        stock-reservation.repository.ts       Port + injection token STOCK_RESERVATION_REPOSITORY
        stock.service.ts                      Domain service: reserve/confirm/release, availableStock — coordinates the two entities above
        errors/
          product-not-found.error.ts
          out-of-stock.error.ts
      infrastructure/
        in-memory-product.repository.ts       Implements ProductRepository — seeds the 3 products
        in-memory-stock-reservation.repository.ts
      inventory.module.ts
      inventory.controller.ts                 GET /products
    orders/
      domain/
        order.entity.ts                       Order — confirm()/fail() are no-ops once already resolved, enforcing "terminal status set exactly once" inside the entity
        order.repository.ts                   Port + injection token ORDER_REPOSITORY
        errors/
          order-not-found.error.ts
      infrastructure/
        in-memory-order.repository.ts
      orders.module.ts
      orders.controller.ts                    GET /orders/:id
    idempotency/
      idempotency.service.ts                  Idempotency-Key → cached success-body map — no port/adapter split (see Task 3: purely technical, single disposable implementation, YAGNI applies)
      idempotency.module.ts
    erp/
      domain/
        erp-gateway.ts                        Port (interface) + injection token ERP_GATEWAY — the anti-corruption layer to the backend system
      infrastructure/
        http-erp.gateway.ts                   Implements ErpGateway by calling erp-mock over HTTP, forwarding ERP_SIM_MODE/ERP_SIM_DELAY_MS as request headers
      erp.module.ts
    checkout/
      application/
        checkout.use-case.ts                  The one Application Service: orchestrates idempotency, inventory, orders, and the ERP gateway for the "place an order" story
        checkout.use-case.spec.ts             Required unit tests (each error branch, cache short-circuit)
      dto/
        checkout-request.dto.ts               class-validator DTO for productId/quantity (idempotencyKey optional here — see Task 3)
      checkout.controller.ts                  POST /checkout — pure pass-through to the use case
      checkout.module.ts
  test/
    jest-e2e.json
    global-setup.ts                           Spawns erp-mock before the e2e suite runs, polls /health, sets ERP_MOCK_URL
    global-teardown.ts                        Kills the erp-mock process spawned by global-setup.ts
    utils/
      create-test-app.ts                      Boots a full Nest app via Test.createTestingModule + configureApp()
    products.e2e-spec.ts
    checkout.e2e-spec.ts                       (all POST /checkout + GET /orders/:id scenarios)

erp-mock/
  package.json
  tsconfig.json
  src/
    app.ts                                    Express app: POST /erp/orders (header-driven simulate mode/delay), GET /health — exported unbound so tests can use supertest against it directly
    main.ts                                   Binds app to a port and starts listening
  test/
    app.spec.ts                               One test per simulate mode, one proving the delay header is honored, one for the header-less default, one for /health

frontend/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/
    api.ts               fetch wrapper: fetchProducts / postCheckout / fetchOrderStatus
    App.tsx               Product list + checkout form + status handling
    main.tsx              ReactDOM entry point
  test/
    setup.ts
    App.test.tsx          All component-level scenarios

README.md                 Root — install/run instructions, decisions, limitations
PROMPTS.md                 Root — relevant AI prompts used during development
```

**Why Product and Stock share one bounded context.** `StockService` needs `ProductRepository` to read a product's base stock, and `GET /products` needs `StockService` to compute availability for display — if "catalog" and "stock" were two separate modules importing each other's exports, that would be a circular module dependency. The deeper reason it's fine to merge them: in a shop this size, "what a product is" and "how much of it is available" aren't really separate business capabilities — they're the same **Inventory** concern, so `InventoryModule` is the honest bounded-context boundary, not a workaround. `CheckoutUseCase` is the only place that coordinates Inventory, Orders, idempotency, and the ERP gateway together; `CheckoutController` and `OrdersController` do no branching of their own — they call a use case/repository and return what it gives them, or let a thrown domain error reach the global filter.

---

### Task 1: Backend scaffold, Inventory domain, and `GET /products`

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/tsconfig.build.json`
- Create: `backend/nest-cli.json`
- Create: `backend/test/jest-e2e.json`
- Create: `backend/src/shared/domain/domain-error.ts`
- Create: `backend/src/shared/domain/errors/invalid-input.error.ts`
- Create: `backend/src/shared/presentation/filters/http-exception.filter.ts`
- Create: `backend/src/bootstrap.ts`
- Create: `backend/src/inventory/domain/product.entity.ts`
- Create: `backend/src/inventory/domain/product.repository.ts`
- Create: `backend/src/inventory/domain/stock-reservation.entity.ts`
- Create: `backend/src/inventory/domain/stock-reservation.repository.ts`
- Create: `backend/src/inventory/domain/stock.service.ts`
- Create: `backend/src/inventory/infrastructure/in-memory-product.repository.ts`
- Create: `backend/src/inventory/infrastructure/in-memory-stock-reservation.repository.ts`
- Create: `backend/src/inventory/inventory.controller.ts`
- Create: `backend/src/inventory/inventory.module.ts`
- Create: `backend/src/app.module.ts`
- Create: `backend/src/main.ts`
- Create: `backend/test/utils/create-test-app.ts`
- Test: `backend/test/products.e2e-spec.ts`

**Interfaces:**
- Produces: `DomainError` (abstract base: `code`, `message`, optional `field`) and `InvalidInputError` (`VALIDATION_ERROR`) — Task 3 adds `ProductNotFoundError`, `OutOfStockError`, `OrderNotFoundError` as sibling `DomainError` subclasses inside their own bounded contexts
- Produces: `Product` entity (`id`, `name`, `priceCents`, `get stock()`, `deduct(quantity)`), `ProductRepository` port (`findById`, `findAll`, `save`) + `PRODUCT_REPOSITORY` token
- Produces: `StockReservation` entity (`orderId`, `productId`, `quantity`, `get status()`, `isExpired(now)`, `confirm()`, `release()`), `StockReservationRepository` port (`save`, `findByOrderId`, `findActive`) + `STOCK_RESERVATION_REPOSITORY` token
- Produces: `StockService.{availableStock(productId), reserveStock(orderId, productId, quantity), confirmReservation(orderId), releaseReservation(orderId)}` — a domain service, injected into `CheckoutUseCase` in Task 3
- Produces: `configureApp(app: INestApplication): void` (`bootstrap.ts`) — wires the global `ValidationPipe` (custom `exceptionFactory` throwing `InvalidInputError`) and the global `HttpExceptionFilter`; used identically by `main.ts` and by every e2e test's `createTestApp()`

- [ ] **Step 1: Scaffold the backend package**

```bash
mkdir -p backend/src backend/test/utils
cd backend
npm init -y
npm install @nestjs/common@^10.4.0 @nestjs/core@^10.4.0 @nestjs/platform-express@^10.4.0 class-transformer@^0.5.1 class-validator@^0.14.1 reflect-metadata@^0.2.2 rxjs@^7.8.1
npm install -D @nestjs/cli@^10.4.5 @nestjs/testing@^10.4.0 @types/express@^4.17.21 @types/jest@^29.5.12 @types/node@^20.14.0 @types/supertest@^6.0.2 jest@^29.7.0 supertest@^7.0.0 ts-jest@^29.2.5 ts-node@^10.9.2 typescript@^5.5.0
```

- [ ] **Step 2: Write `backend/package.json` scripts and Jest unit-test config**

```json
{
  "name": "casecellshop-backend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:dev": "nest start --watch",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.0",
    "@nestjs/core": "^10.4.0",
    "@nestjs/platform-express": "^10.4.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.5",
    "@nestjs/testing": "^10.4.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

`"test"` runs only `*.spec.ts` (unit tests, via the `jest` block's `testRegex`, rooted at `src/`); `"test:e2e"` runs only `*.e2e-spec.ts` (via the separate config in Step 6) — the two suites never overlap.

- [ ] **Step 3: Write `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "strictBindCallApply": true,
    "forceConsistentCasingInFileNames": true,
    "noFallthroughCasesInSwitch": true,
    "strict": true
  }
}
```

- [ ] **Step 4: Write `backend/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 5: Write `backend/nest-cli.json`**

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
```

- [ ] **Step 6: Write `backend/test/jest-e2e.json`**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

- [ ] **Step 7: Write `backend/src/shared/domain/domain-error.ts` and `backend/src/shared/domain/errors/invalid-input.error.ts`**

```ts
// backend/src/shared/domain/domain-error.ts
export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly field?: string;

  protected constructor(message: string, field?: string) {
    super(message);
    this.name = new.target.name;
    this.field = field;
  }
}
```

```ts
// backend/src/shared/domain/errors/invalid-input.error.ts
import { DomainError } from "../domain-error";

export class InvalidInputError extends DomainError {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string, field: string) {
    super(message, field);
  }
}
```

`DomainError` has zero imports from `@nestjs/common` or Express — a domain error is a plain class that knows nothing about HTTP, per the constitution. `field` is optional on the base class (most domain errors don't need one) but every subclass gets it for free; `InvalidInputError` is the one that actually uses it, and it's reused both for DTO shape failures (Step 9) and, in Task 3, for the "idempotencyKey is required" business rule — one class, two call sites, because both are the same kind of failure (bad input) from the API consumer's point of view.

- [ ] **Step 8: Write `backend/src/shared/presentation/filters/http-exception.filter.ts`**

```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Response } from "express";
import { DomainError } from "../../domain/domain-error";

const DOMAIN_ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  OUT_OF_STOCK: HttpStatus.CONFLICT,
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof DomainError) {
      const status = DOMAIN_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
      response.status(status).json({
        error: { code: exception.code, message: exception.message, field: exception.field },
      });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json(exception.getResponse());
      return;
    }

    this.logger.error("Unhandled exception", exception instanceof Error ? exception.stack : exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: "INTERNAL_ERROR", message: "Ocorreu um erro inesperado. Tente novamente." },
    });
  }
}
```

This is the single place the error contract is enforced (Constitution: "o mapeamento erro-de-domínio → HTTP status não fica espalhado pelos controllers"). `DOMAIN_ERROR_STATUS` is the one lookup table that knows a domain error's `code` maps to a given HTTP status; nothing else in the codebase needs to know that mapping. `Task 3` adds `PRODUCT_NOT_FOUND`, `OUT_OF_STOCK`, and `ORDER_NOT_FOUND` entries here as those errors are introduced — the `instanceof HttpException` branch stays only as a safety net for anything Nest itself throws before reaching our code; anything truly unexpected (a real bug) gets logged server-side and turned into a generic, detail-free 500 (Constitution "Security": no stack trace ever reaches the client).

- [ ] **Step 9: Write `backend/src/bootstrap.ts`**

```ts
import { INestApplication, ValidationError, ValidationPipe } from "@nestjs/common";
import { InvalidInputError } from "./shared/domain/errors/invalid-input.error";
import { HttpExceptionFilter } from "./shared/presentation/filters/http-exception.filter";

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const first = errors[0];
        const message = Object.values(first.constraints ?? {})[0] ?? "Dado inválido.";
        return new InvalidInputError(message, first.property);
      },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
}
```

`exceptionFactory` intercepts a DTO validation failure and throws our own `InvalidInputError` — a plain `DomainError`, not an `HttpException` — instead of Nest's default `BadRequestException`. Nest doesn't require what a pipe throws to be an `HttpException`; the global filter's `@Catch()` catches anything, and its `instanceof DomainError` branch (Step 8) already knows how to render it in our exact contract shape. `configureApp` is a plain function, not a Nest provider, specifically so both `main.ts` (Step 16) and `test/utils/create-test-app.ts` (Step 17) can call the exact same wiring.

- [ ] **Step 10: Write `backend/src/inventory/domain/product.entity.ts` and `backend/src/inventory/domain/product.repository.ts`**

```ts
// backend/src/inventory/domain/product.entity.ts
export class Product {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly priceCents: number,
    private stockQuantity: number,
  ) {}

  get stock(): number {
    return this.stockQuantity;
  }

  deduct(quantity: number): void {
    if (quantity > this.stockQuantity) {
      throw new Error(`Cannot deduct ${quantity} units of "${this.id}" — only ${this.stockQuantity} in stock.`);
    }
    this.stockQuantity -= quantity;
  }
}
```

```ts
// backend/src/inventory/domain/product.repository.ts
import { Product } from "./product.entity";

export interface ProductRepository {
  findById(id: string): Product | undefined;
  findAll(): Product[];
  save(product: Product): void;
}

export const PRODUCT_REPOSITORY = Symbol("PRODUCT_REPOSITORY");
```

`deduct()` is the entity enforcing its own invariant (stock never goes negative) instead of trusting a caller to check first — `StockService` (Step 14) still checks availability before calling it, so this throw is a last-resort guard against a future bug, not the normal error path. `save()` exists on the port even though the in-memory adapter (Step 15) makes it a no-op — the object already mutated in place is the same object the repository holds — because a real database-backed implementation would need an explicit write, and the port's job is to describe what any implementation must support.

- [ ] **Step 11: Write `backend/src/inventory/domain/stock-reservation.entity.ts` and `backend/src/inventory/domain/stock-reservation.repository.ts`**

```ts
// backend/src/inventory/domain/stock-reservation.entity.ts
export type StockReservationStatus = "active" | "confirmed" | "released";

export class StockReservation {
  private status_: StockReservationStatus = "active";

  constructor(
    public readonly orderId: string,
    public readonly productId: string,
    public readonly quantity: number,
    private readonly expiresAt: number,
  ) {}

  get status(): StockReservationStatus {
    return this.status_;
  }

  isExpired(now: number): boolean {
    return this.status_ === "active" && now >= this.expiresAt;
  }

  confirm(): void {
    if (this.status_ !== "active") return;
    this.status_ = "confirmed";
  }

  release(): void {
    if (this.status_ !== "active") return;
    this.status_ = "released";
  }
}
```

```ts
// backend/src/inventory/domain/stock-reservation.repository.ts
import { StockReservation } from "./stock-reservation.entity";

export interface StockReservationRepository {
  save(reservation: StockReservation): void;
  findByOrderId(orderId: string): StockReservation | undefined;
  findActive(): StockReservation[];
}

export const STOCK_RESERVATION_REPOSITORY = Symbol("STOCK_RESERVATION_REPOSITORY");
```

`confirm()`/`release()` are no-ops once the reservation has already left the `"active"` state — the entity itself enforces "a reservation resolves exactly once," the same pattern `Order` will use in Task 3, so nothing outside this class needs an `if` to guard against double-confirming or double-releasing.

- [ ] **Step 12: Write `backend/src/inventory/domain/stock.service.ts`**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "./product.repository";
import { STOCK_RESERVATION_REPOSITORY, StockReservationRepository } from "./stock-reservation.repository";
import { StockReservation } from "./stock-reservation.entity";

const RESERVATION_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class StockService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STOCK_RESERVATION_REPOSITORY) private readonly reservations: StockReservationRepository,
  ) {}

  availableStock(productId: string): number {
    this.sweepExpired();
    const product = this.products.findById(productId);
    if (!product) return 0;
    return product.stock - this.reservedFor(productId);
  }

  reserveStock(orderId: string, productId: string, quantity: number): boolean {
    this.sweepExpired();
    const product = this.products.findById(productId);
    if (!product) return false;

    const available = product.stock - this.reservedFor(productId);
    if (available < quantity) return false;

    const reservation = new StockReservation(orderId, productId, quantity, Date.now() + RESERVATION_TTL_MS);
    this.reservations.save(reservation);
    return true;
  }

  confirmReservation(orderId: string): void {
    const reservation = this.reservations.findByOrderId(orderId);
    if (!reservation) return;

    const product = this.products.findById(reservation.productId);
    product?.deduct(reservation.quantity);
    if (product) this.products.save(product);

    reservation.confirm();
    this.reservations.save(reservation);
  }

  releaseReservation(orderId: string): void {
    const reservation = this.reservations.findByOrderId(orderId);
    if (!reservation) return;

    reservation.release();
    this.reservations.save(reservation);
  }

  private reservedFor(productId: string): number {
    return this.reservations
      .findActive()
      .filter((r) => r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const reservation of this.reservations.findActive()) {
      if (reservation.isExpired(now)) {
        reservation.release();
        this.reservations.save(reservation);
      }
    }
  }
}
```

`StockService` is the Domain Service that coordinates the two entities above — neither `Product` nor `StockReservation` alone knows how to answer "is there enough stock," because that requires looking at both. Note `reserveStock` still has no `await` anywhere in its body — that's the whole trick behind ADR-002's "indivisible operation," and it survives the DDD restructuring unchanged: `StockService` is a singleton-scoped provider, so there's exactly one instance for the whole process, and calling one of its synchronous methods can never be interleaved with another call to the same method, no matter how many concurrent HTTP requests are in flight. Task 3's concurrency test proves this end-to-end. `save()` calls after every mutation exist even though the in-memory adapters treat them as no-ops (Step 13) — the mutation already happened on the same object the repository holds — because that's exactly the seam a real database-backed adapter would need to persist, and calling it consistently now is what lets that swap happen later without touching this file.

- [ ] **Step 13: Write `backend/src/inventory/infrastructure/in-memory-product.repository.ts` and `backend/src/inventory/infrastructure/in-memory-stock-reservation.repository.ts`**

```ts
// backend/src/inventory/infrastructure/in-memory-product.repository.ts
import { Injectable } from "@nestjs/common";
import { ProductRepository } from "../domain/product.repository";
import { Product } from "../domain/product.entity";

@Injectable()
export class InMemoryProductRepository implements ProductRepository {
  private readonly products: Product[] = [
    new Product("capinha-preta", "Capinha Preta Fosca", 3990, 5),
    new Product("capinha-transparente", "Capinha Transparente", 2990, 10),
    new Product("capinha-listrada", "Capinha Listrada", 3490, 1),
  ];

  findById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  findAll(): Product[] {
    return this.products;
  }

  save(): void {
    // The entity handed to save() is already the same in-memory instance held above — nothing to persist.
  }
}
```

```ts
// backend/src/inventory/infrastructure/in-memory-stock-reservation.repository.ts
import { Injectable } from "@nestjs/common";
import { StockReservationRepository } from "../domain/stock-reservation.repository";
import { StockReservation } from "../domain/stock-reservation.entity";

@Injectable()
export class InMemoryStockReservationRepository implements StockReservationRepository {
  private readonly reservations = new Map<string, StockReservation>();

  save(reservation: StockReservation): void {
    this.reservations.set(reservation.orderId, reservation);
  }

  findByOrderId(orderId: string): StockReservation | undefined {
    return this.reservations.get(orderId);
  }

  findActive(): StockReservation[] {
    return [...this.reservations.values()].filter((r) => r.status === "active");
  }
}
```

These are the Infrastructure adapters behind the two ports from Steps 10-11 — the concrete, swappable technology (a `Map`/array in memory today) behind the domain's `ProductRepository`/`StockReservationRepository` interfaces. Nothing in `domain/` imports either of these files; `inventory.module.ts` (Step 15) is the only place that wires a port to this specific adapter.

- [ ] **Step 14: Write `backend/src/inventory/inventory.controller.ts`**

```ts
import { Controller, Get, Inject } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "./domain/product.repository";
import { StockService } from "./domain/stock.service";

@Controller("products")
export class InventoryController {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly stock: StockService,
  ) {}

  @Get()
  list() {
    const products = this.products.findAll().map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      stock: this.stock.availableStock(p.id),
    }));
    return { products };
  }
}
```

The controller injects the repository *port* (`PRODUCT_REPOSITORY`), never the concrete `InMemoryProductRepository` — this is what lets `inventory.module.ts` swap the adapter later without a single line here changing.

- [ ] **Step 15: Write `backend/src/inventory/inventory.module.ts`, `backend/src/app.module.ts`, and `backend/src/main.ts`**

```ts
// backend/src/inventory/inventory.module.ts
import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { StockService } from "./domain/stock.service";
import { PRODUCT_REPOSITORY } from "./domain/product.repository";
import { STOCK_RESERVATION_REPOSITORY } from "./domain/stock-reservation.repository";
import { InMemoryProductRepository } from "./infrastructure/in-memory-product.repository";
import { InMemoryStockReservationRepository } from "./infrastructure/in-memory-stock-reservation.repository";

@Module({
  controllers: [InventoryController],
  providers: [
    StockService,
    { provide: PRODUCT_REPOSITORY, useClass: InMemoryProductRepository },
    { provide: STOCK_RESERVATION_REPOSITORY, useClass: InMemoryStockReservationRepository },
  ],
  exports: [StockService, PRODUCT_REPOSITORY],
})
export class InventoryModule {}
```

```ts
// backend/src/app.module.ts
import { Module } from "@nestjs/common";
import { InventoryModule } from "./inventory/inventory.module";

@Module({
  imports: [InventoryModule],
})
export class AppModule {}
```

```ts
// backend/src/main.ts
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);
}
bootstrap();
```

`{ provide: PRODUCT_REPOSITORY, useClass: InMemoryProductRepository }` is the one line in the whole backend that binds the port to this specific adapter — every other file that needs a product only ever asks for `PRODUCT_REPOSITORY`.

- [ ] **Step 16: Write `backend/test/utils/create-test-app.ts` and the failing test for `GET /products`**

```ts
// backend/test/utils/create-test-app.ts
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
```

```ts
// backend/test/products.e2e-spec.ts
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

describe("GET /products (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the seeded product catalog with available stock", async () => {
    const res = await request(app.getHttpServer()).get("/products");

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    const first = res.body.products[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("priceCents");
    expect(first).toHaveProperty("stock");
  });
});
```

- [ ] **Step 17: Run the test to verify it fails, then implement in order and re-run until it passes**

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected before Steps 7-15 exist: FAIL — `Cannot find module '../../src/app.module'`
Expected once Steps 7-15 are all written: PASS

- [ ] **Step 18: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/tsconfig.json backend/tsconfig.build.json backend/nest-cli.json backend/test/jest-e2e.json backend/src backend/test
git commit -m "feat(backend): scaffold NestJS project with DDD-layered Inventory context and GET /products"
```

---

### Task 2: ERP mock service (`erp-mock/`)

A standalone package, deliberately outside the NestJS/DDD mandate (Constitution "Stack and Technologies") — it's a test double standing in for a system this project doesn't own, not part of the product being built. Its only job: behave like a real, occasionally slow/unstable external HTTP dependency, so `backend`'s resilience patterns (Task 3) are tested against an actual network boundary instead of an in-process fake.

**Design note — why behavior is driven by request headers, not server state.** If the simulate mode were set via some admin endpoint holding mutable state on the server, two e2e requests running concurrently (Task 3's last-unit concurrency test, for instance) could race on that shared state and read each other's configuration. Reading the desired mode/delay from headers on *each* request keeps the mock itself stateless — the exact same guarantee the old in-process design got for free by reading `process.env` fresh on every call (Task 3, Step 5).

**Files:**
- Create: `erp-mock/package.json`
- Create: `erp-mock/tsconfig.json`
- Create: `erp-mock/src/app.ts`
- Create: `erp-mock/src/main.ts`
- Test: `erp-mock/test/app.spec.ts`

**Interfaces:**
- Produces: Express `app` (exported from `src/app.ts`, importable directly by its own tests via `supertest(app)` — no port needs to be bound for that), `POST /erp/orders` (headers `X-Erp-Simulate-Mode: always-success|always-fail|always-timeout|random`, default `random`; `X-Erp-Simulate-Delay-Ms: <number>`; request body ignored; responds `{ success: boolean }`), `GET /health` (`{ status: "ok" }`) — this contract is consumed by `backend`'s `HttpErpGateway` and by `backend/test/global-setup.ts` in Task 3.

- [ ] **Step 1: Scaffold the erp-mock package**

```bash
mkdir -p erp-mock/src erp-mock/test
cd erp-mock
npm init -y
npm install express@^4.19.2
npm install -D typescript@^5.5.0 ts-node@^10.9.2 @types/express@^4.17.21 @types/node@^20.14.0 @types/jest@^29.5.12 @types/supertest@^6.0.2 jest@^29.7.0 ts-jest@^29.2.5 supertest@^7.0.0
```

- [ ] **Step 2: Write `erp-mock/package.json` scripts and Jest config**

```json
{
  "name": "casecellshop-erp-mock",
  "version": "1.0.0",
  "private": true,
  "engines": { "node": ">=20" },
  "scripts": {
    "dev": "ts-node src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.19.2"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.14.0",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-node": "^10.9.2",
    "typescript": "^5.5.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": ".",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Write `erp-mock/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "outDir": "./dist",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true
  }
}
```

- [ ] **Step 4: Write the failing test — `erp-mock/test/app.spec.ts`**

```ts
import request from "supertest";
import { app } from "../src/app";

describe("POST /erp/orders", () => {
  it("returns success when mode is always-success", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-success")
      .set("X-Erp-Simulate-Delay-Ms", "10")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns failure when mode is always-fail", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-fail")
      .set("X-Erp-Simulate-Delay-Ms", "10")
      .send({});

    expect(res.body.success).toBe(false);
  });

  it("eventually returns success in always-timeout mode, honoring the delay header", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-timeout")
      .set("X-Erp-Simulate-Delay-Ms", "50")
      .send({});

    expect(res.body.success).toBe(true);
  }, 2000);

  it("honors the requested delay before responding", async () => {
    const start = Date.now();
    await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-success")
      .set("X-Erp-Simulate-Delay-Ms", "300")
      .send({});

    expect(Date.now() - start).toBeGreaterThanOrEqual(280);
  });

  it("defaults to a well-formed random response when no mode header is sent", async () => {
    const res = await request(app).post("/erp/orders").set("X-Erp-Simulate-Delay-Ms", "10").send({});
    expect(typeof res.body.success).toBe("boolean");
  });
});

describe("GET /health", () => {
  it("responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
```

Every assertion here targets externally observable behavior (status code, response shape, elapsed time) — never an internal variable — the same standard the backend's own tests hold to (SPEC "Testing Decisions").

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd erp-mock && npx jest`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 6: Write `erp-mock/src/app.ts`**

```ts
import express, { Request, Response } from "express";

type SimulateMode = "always-success" | "always-fail" | "always-timeout" | "random";

export const app = express();
app.use(express.json());

app.post("/erp/orders", async (req: Request, res: Response) => {
  const mode = (req.header("X-Erp-Simulate-Mode") as SimulateMode | undefined) ?? "random";
  const delayHeader = req.header("X-Erp-Simulate-Delay-Ms");

  if (mode === "always-timeout") {
    await sleep(delayHeader ? Number(delayHeader) : 10_000);
    res.json({ success: true });
    return;
  }

  await sleep(delayHeader ? Number(delayHeader) : randomBetween(500, 4000));

  if (mode === "always-success") {
    res.json({ success: true });
    return;
  }
  if (mode === "always-fail") {
    res.json({ success: false });
    return;
  }
  res.json({ success: Math.random() < 0.8 });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
```

This is nearly a verbatim port of the old in-process `SimulatedErpGateway`'s logic (same modes, same default delay range) — only the trigger changed, from a method call reading `process.env` to an HTTP handler reading headers. That continuity is deliberate: the *simulation* behavior isn't what's being redesigned here, only *where* it runs.

- [ ] **Step 7: Write `erp-mock/src/main.ts`**

```ts
import { app } from "./app";

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`erp-mock listening on port ${port}`);
});
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd erp-mock && npx jest`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add erp-mock/package.json erp-mock/package-lock.json erp-mock/tsconfig.json erp-mock/src erp-mock/test
git commit -m "feat(erp-mock): add standalone HTTP service simulating ERP slowness and instability"
```

---

### Task 3: Checkout core — `POST /checkout` and `GET /orders/:id`

This is the safety-critical task: stock consistency, idempotency, and ERP resilience all live here. It is one task (not several) because a reviewer can't meaningfully approve "checkout works for valid input" while rejecting "checkout rejects invalid input" — it's one endpoint, reviewed as a whole. Steps are still bite-sized; they build up the `Orders` context, the `Erp` gateway, and the `CheckoutUseCase` scenario by scenario.

**Design note — why only the success response is cached for idempotency**: a validation error, a not-found, and an out-of-stock response are all pure functions of the current input and stock level — resending the same request recomputes the identical answer anyway, with no side effect to duplicate. The one response with a side effect (an order created, stock reserved) is the `202` success — that's the only one that actually needs to be remembered, so a retry returns the *original* order instead of creating a second one. This is a deliberate simplification over caching every branch (see `spec.md` "Idempotency").

**Files:**
- Create: `backend/src/inventory/domain/errors/product-not-found.error.ts`
- Create: `backend/src/inventory/domain/errors/out-of-stock.error.ts`
- Modify: `backend/src/app.module.ts` — import `CheckoutModule` and `OrdersModule`
- Create: `backend/src/orders/domain/order.entity.ts`
- Create: `backend/src/orders/domain/order.repository.ts`
- Create: `backend/src/orders/domain/errors/order-not-found.error.ts`
- Create: `backend/src/orders/infrastructure/in-memory-order.repository.ts`
- Create: `backend/src/orders/orders.controller.ts`
- Create: `backend/src/orders/orders.module.ts`
- Create: `backend/src/idempotency/idempotency.service.ts`
- Create: `backend/src/idempotency/idempotency.module.ts`
- Create: `backend/src/erp/domain/erp-gateway.ts`
- Create: `backend/src/erp/infrastructure/http-erp.gateway.ts`
- Create: `backend/src/erp/erp.module.ts`
- Create: `backend/test/global-setup.ts`
- Create: `backend/test/global-teardown.ts`
- Modify: `backend/test/jest-e2e.json` — add `globalSetup`/`globalTeardown`
- Create: `backend/src/checkout/dto/checkout-request.dto.ts`
- Create: `backend/src/checkout/application/checkout.use-case.ts`
- Create: `backend/src/checkout/checkout.controller.ts`
- Create: `backend/src/checkout/checkout.module.ts`
- Create: `backend/src/inventory/domain/stock.service.spec.ts`
- Create: `backend/src/checkout/application/checkout.use-case.spec.ts`
- Test: `backend/test/checkout.e2e-spec.ts`

**Interfaces:**
- Consumes: `PRODUCT_REPOSITORY`/`ProductRepository`, `StockService` (Task 1); `DomainError`/`InvalidInputError` (Task 1); `erp-mock`'s `POST /erp/orders` and `GET /health` HTTP contract (Task 2)
- Produces: `ProductNotFoundError` (`PRODUCT_NOT_FOUND`), `OutOfStockError` (`OUT_OF_STOCK`) — `DomainError` subclasses in the Inventory context
- Produces: `Order` entity (`id`, `productId`, `quantity`, `get status()`, `get errorCode()`, `get errorMessage()`, `confirm()`, `fail(code, message)`), `OrderRepository` port (`create(productId, quantity): Order`, `findById(id): Order|undefined`, `save(order): void`) + `ORDER_REPOSITORY` token, `OrderNotFoundError` (`ORDER_NOT_FOUND`)
- Produces: `IdempotencyService.{getStoredResponse(key), storeResponse(key, body)}`, `CheckoutSuccessBody { orderId, status: "pending", statusUrl }`
- Produces: `ErpGateway` port (`call(): Promise<ErpOutcome>`) + `ERP_GATEWAY` token, `HttpErpGateway` adapter (calls `erp-mock` over HTTP, forwarding `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` — read fresh on every call, exactly as before — as request headers)
- Produces: `CheckoutRequestDto { productId: string; quantity: number; idempotencyKey?: string }` — `idempotencyKey` is optional *in the DTO* because it may arrive via header instead; `CheckoutUseCase.execute` is what actually enforces that at least one of the two is present
- Produces: `CheckoutUseCase.execute(dto: CheckoutRequestDto, headerKey?: string): Promise<CheckoutSuccessBody>` — throws `InvalidInputError`/`ProductNotFoundError`/`OutOfStockError` instead of returning an error value; the global filter (Task 1) turns whichever is thrown into the matching HTTP response

- [ ] **Step 1: Write the Inventory domain errors and register them in the filter**

```ts
// backend/src/inventory/domain/errors/product-not-found.error.ts
import { DomainError } from "../../../shared/domain/domain-error";

export class ProductNotFoundError extends DomainError {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor() {
    super("Produto não encontrado.");
  }
}
```

```ts
// backend/src/inventory/domain/errors/out-of-stock.error.ts
import { DomainError } from "../../../shared/domain/domain-error";

export class OutOfStockError extends DomainError {
  readonly code = "OUT_OF_STOCK";

  constructor() {
    super("Este produto está esgotado no momento.");
  }
}
```

```ts
// backend/src/shared/presentation/filters/http-exception.filter.ts — update DOMAIN_ERROR_STATUS
const DOMAIN_ERROR_STATUS: Record<string, number> = {
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  PRODUCT_NOT_FOUND: HttpStatus.NOT_FOUND,
  OUT_OF_STOCK: HttpStatus.CONFLICT,
  ORDER_NOT_FOUND: HttpStatus.NOT_FOUND,
};
```

(This is the same object already written in Task 1 Step 8 — it's shown fully here as a reminder that Task 1's version must already include these three lines; there is nothing left to edit if Task 1 was implemented as specified.)

- [ ] **Step 2: Write the Orders domain — `order.entity.ts`, `order.repository.ts`, `order-not-found.error.ts`**

```ts
// backend/src/orders/domain/order.entity.ts
export type OrderStatus = "pending" | "confirmed" | "failed";

export class Order {
  private status_: OrderStatus = "pending";
  private errorCode_?: string;
  private errorMessage_?: string;

  constructor(
    public readonly id: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly createdAt: number,
  ) {}

  get status(): OrderStatus {
    return this.status_;
  }

  get errorCode(): string | undefined {
    return this.errorCode_;
  }

  get errorMessage(): string | undefined {
    return this.errorMessage_;
  }

  confirm(): void {
    if (this.status_ !== "pending") return;
    this.status_ = "confirmed";
  }

  fail(errorCode: string, errorMessage: string): void {
    if (this.status_ !== "pending") return;
    this.status_ = "failed";
    this.errorCode_ = errorCode;
    this.errorMessage_ = errorMessage;
  }
}
```

```ts
// backend/src/orders/domain/order.repository.ts
import { Order } from "./order.entity";

export interface OrderRepository {
  create(productId: string, quantity: number): Order;
  findById(id: string): Order | undefined;
  save(order: Order): void;
}

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
```

```ts
// backend/src/orders/domain/errors/order-not-found.error.ts
import { DomainError } from "../../../shared/domain/domain-error";

export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";

  constructor() {
    super("Pedido não encontrado.");
  }
}
```

`confirm()`/`fail()` are no-ops once `status_` has already left `"pending"` — the same self-protecting pattern as `StockReservation` (Task 1 Step 11). This is what makes "a terminal status is set exactly once" true by construction: nothing outside `Order` needs to check the current status before calling either method, because the entity already refuses to change twice.

- [ ] **Step 3: Write `backend/src/orders/infrastructure/in-memory-order.repository.ts`, `orders.controller.ts`, and `orders.module.ts`**

```ts
// backend/src/orders/infrastructure/in-memory-order.repository.ts
import { Injectable } from "@nestjs/common";
import { OrderRepository } from "../domain/order.repository";
import { Order } from "../domain/order.entity";

@Injectable()
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = 1;

  create(productId: string, quantity: number): Order {
    const id = `ord_${String(this.nextOrderNumber++).padStart(6, "0")}`;
    const order = new Order(id, productId, quantity, Date.now());
    this.orders.set(id, order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  save(): void {
    // The entity handed to save() is already the same in-memory instance held above — nothing to persist.
  }
}
```

```ts
// backend/src/orders/orders.controller.ts
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ORDER_REPOSITORY, OrderRepository } from "./domain/order.repository";
import { OrderNotFoundError } from "./domain/errors/order-not-found.error";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  @Get(":id")
  getStatus(@Param("id") id: string) {
    const order = this.orders.findById(id);
    if (!order) throw new OrderNotFoundError();

    if (order.status === "failed") {
      return {
        orderId: order.id,
        status: "failed",
        error: { code: order.errorCode, message: order.errorMessage },
      };
    }
    return { orderId: order.id, status: order.status };
  }
}
```

```ts
// backend/src/orders/orders.module.ts
import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { ORDER_REPOSITORY } from "./domain/order.repository";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-order.repository";

@Module({
  controllers: [OrdersController],
  providers: [{ provide: ORDER_REPOSITORY, useClass: InMemoryOrderRepository }],
  exports: [ORDER_REPOSITORY],
})
export class OrdersModule {}
```

- [ ] **Step 4: Write `backend/src/idempotency/idempotency.service.ts` and `idempotency.module.ts`**

```ts
// backend/src/idempotency/idempotency.service.ts
import { Injectable } from "@nestjs/common";

export interface CheckoutSuccessBody {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

@Injectable()
export class IdempotencyService {
  private readonly store = new Map<string, CheckoutSuccessBody>();

  getStoredResponse(key: string): CheckoutSuccessBody | undefined {
    return this.store.get(key);
  }

  storeResponse(key: string, response: CheckoutSuccessBody): void {
    this.store.set(key, response);
  }
}
```

```ts
// backend/src/idempotency/idempotency.module.ts
import { Module } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";

@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
```

No repository port here — this is the constitution's explicit YAGNI exception (Task 1's constitution update: "not every technical, non-business concern needs this full port/adapter ceremony"). An idempotency cache is a purely technical mechanism with a single, disposable implementation; it isn't part of the domain model the way `Product` or `Order` are, so it stays a plain injectable service.

- [ ] **Step 5: Write `backend/src/erp/domain/erp-gateway.ts`, `backend/src/erp/infrastructure/http-erp.gateway.ts`, and `erp.module.ts`**

```ts
// backend/src/erp/domain/erp-gateway.ts
export interface ErpOutcome {
  success: boolean;
}

export interface ErpGateway {
  call(): Promise<ErpOutcome>;
}

export const ERP_GATEWAY = Symbol("ERP_GATEWAY");
```

```ts
// backend/src/erp/infrastructure/http-erp.gateway.ts
import { Injectable } from "@nestjs/common";
import { ErpGateway, ErpOutcome } from "../domain/erp-gateway";

@Injectable()
export class HttpErpGateway implements ErpGateway {
  async call(): Promise<ErpOutcome> {
    const baseUrl = process.env.ERP_MOCK_URL || "http://localhost:4000";
    const mode = process.env.ERP_SIM_MODE || "random";
    const delayOverride = process.env.ERP_SIM_DELAY_MS;

    const res = await fetch(`${baseUrl}/erp/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Erp-Simulate-Mode": mode,
        ...(delayOverride ? { "X-Erp-Simulate-Delay-Ms": delayOverride } : {}),
      },
      body: JSON.stringify({}),
    });

    const data = (await res.json()) as { success: boolean };
    return { success: data.success };
  }
}
```

```ts
// backend/src/erp/erp.module.ts
import { Module } from "@nestjs/common";
import { ERP_GATEWAY } from "./domain/erp-gateway";
import { HttpErpGateway } from "./infrastructure/http-erp.gateway";

@Module({
  providers: [{ provide: ERP_GATEWAY, useClass: HttpErpGateway }],
  exports: [ERP_GATEWAY],
})
export class ErpModule {}
```

`ErpGateway` is the anti-corruption layer to the ERP system (Constitution: a "gateway to an external system") and it hasn't changed shape at all from an earlier in-process design — that's the point: `CheckoutUseCase` never knew it was talking to a fake, and it doesn't need to know it's now talking to a real HTTP service either. `HttpErpGateway` reads the exact same `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` environment variables every test in this task already sets — it just forwards them as headers on the request to `erp-mock` (Task 2) instead of branching on them itself. Node 20's global `fetch` needs no extra dependency. `ERP_MOCK_URL` defaults to `http://localhost:4000` (erp-mock's own default port) for local manual runs; Step 6 below overrides it for tests.

- [ ] **Step 6: Write `backend/test/global-setup.ts` and `backend/test/global-teardown.ts`; modify `backend/test/jest-e2e.json`**

```ts
// backend/test/global-setup.ts
import { spawn, ChildProcess } from "child_process";
import * as path from "path";

const ERP_MOCK_TEST_PORT = 4100;

export default async function globalSetup(): Promise<void> {
  const erpMockDir = path.resolve(__dirname, "../../erp-mock");
  const child: ChildProcess = spawn("npx", ["ts-node", "src/main.ts"], {
    cwd: erpMockDir,
    env: { ...process.env, PORT: String(ERP_MOCK_TEST_PORT) },
    stdio: "ignore",
  });

  await waitForHealth(`http://localhost:${ERP_MOCK_TEST_PORT}/health`);

  process.env.ERP_MOCK_URL = `http://localhost:${ERP_MOCK_TEST_PORT}`;
  (globalThis as Record<string, unknown>).__ERP_MOCK_PROCESS__ = child;
}

async function waitForHealth(url: string, attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // erp-mock isn't listening yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `erp-mock did not become healthy at ${url} in time — check it starts cleanly with "npm run dev" inside erp-mock/`,
  );
}
```

```ts
// backend/test/global-teardown.ts
import { ChildProcess } from "child_process";

export default async function globalTeardown(): Promise<void> {
  const child = (globalThis as Record<string, unknown>).__ERP_MOCK_PROCESS__ as ChildProcess | undefined;
  child?.kill();
}
```

```json
// backend/test/jest-e2e.json — add globalSetup/globalTeardown to the config already written in Task 1, Step 6
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "globalSetup": "<rootDir>/global-setup.ts",
  "globalTeardown": "<rootDir>/global-teardown.ts"
}
```

This is what keeps `npm run test:e2e` a single command despite `erp-mock` being a genuinely separate package: `globalSetup` spawns it once, before any test file runs, waits for `/health` to respond so a slow start is never misread as `erp-mock` actually being broken, and only then lets Jest continue; `globalTeardown` kills that same process once every test file is done. Jest resolves `globalSetup`/`globalTeardown` through the same `transform` this config already declares, so a `.ts` file here just works — no separate compile step needed. `waitForHealth`'s explicit failure message is deliberate: without it, a test that can't reach `erp-mock` would instead fail with an opaque `fetch failed` deep inside `HttpErpGateway`, far from the real cause.

- [ ] **Step 7: Write the failing e2e test for the happy path**

```ts
// backend/test/checkout.e2e-spec.ts
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

function uniqueKey(): string {
  return `test-${Math.random().toString(36).slice(2)}`;
}

describe("POST /checkout (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    delete process.env.ERP_SIM_MODE;
    delete process.env.ERP_SIM_DELAY_MS;
  });

  it("accepts a valid purchase and confirms it once the ERP succeeds", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending");
    expect(res.body.orderId).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("confirmed");
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: FAIL — `Cannot find module '../src/checkout/checkout.controller'`, or a 404 before that module exists

- [ ] **Step 9: Write `backend/src/checkout/dto/checkout-request.dto.ts`**

```ts
import { IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from "class-validator";

export class CheckoutRequestDto {
  @IsString({ message: "productId é obrigatório." })
  @IsNotEmpty({ message: "productId é obrigatório." })
  productId!: string;

  @IsInt({ message: "A quantidade deve ser maior que zero." })
  @IsPositive({ message: "A quantidade deve ser maior que zero." })
  quantity!: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
```

`idempotencyKey` stays optional here on purpose — it's a structural/shape concern (is it a string, if present?), not the "is it required at all?" business rule, which depends on whether the header supplied it instead. That rule belongs on the use case (Step 9), not the DTO, per the constitution: "a business rule that must hold regardless of entry point belongs on the domain object, not only on the DTO."

- [ ] **Step 10: Write `backend/src/checkout/application/checkout.use-case.ts`**

```ts
import { Inject, Injectable } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "../../inventory/domain/product.repository";
import { StockService } from "../../inventory/domain/stock.service";
import { ProductNotFoundError } from "../../inventory/domain/errors/product-not-found.error";
import { OutOfStockError } from "../../inventory/domain/errors/out-of-stock.error";
import { ORDER_REPOSITORY, OrderRepository } from "../../orders/domain/order.repository";
import { IdempotencyService, CheckoutSuccessBody } from "../../idempotency/idempotency.service";
import { ERP_GATEWAY, ErpGateway } from "../../erp/domain/erp-gateway";
import { InvalidInputError } from "../../shared/domain/errors/invalid-input.error";
import { CheckoutRequestDto } from "../dto/checkout-request.dto";

const ERP_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];

@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly stock: StockService,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly idempotency: IdempotencyService,
    @Inject(ERP_GATEWAY) private readonly erp: ErpGateway,
  ) {}

  async execute(dto: CheckoutRequestDto, headerKey?: string): Promise<CheckoutSuccessBody> {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;
    if (!idempotencyKey) {
      throw new InvalidInputError("idempotencyKey é obrigatório.", "idempotencyKey");
    }

    const cached = this.idempotency.getStoredResponse(idempotencyKey);
    if (cached) return cached;

    const product = this.products.findById(dto.productId);
    if (!product) throw new ProductNotFoundError();

    const order = this.orders.create(dto.productId, dto.quantity);
    const reserved = this.stock.reserveStock(order.id, dto.productId, dto.quantity);
    if (!reserved) {
      order.fail("OUT_OF_STOCK", "Este produto está esgotado no momento.");
      this.orders.save(order);
      throw new OutOfStockError();
    }

    const body: CheckoutSuccessBody = { orderId: order.id, status: "pending", statusUrl: `/orders/${order.id}` };
    this.idempotency.storeResponse(idempotencyKey, body);

    void this.settleWithErp(order.id);

    return body;
  }

  private async settleWithErp(orderId: string): Promise<void> {
    const order = this.orders.findById(orderId);
    if (!order) return;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await Promise.race([this.erp.call(), this.timeoutAfter(ERP_TIMEOUT_MS)]);
      if (outcome.success) {
        this.stock.confirmReservation(orderId);
        order.confirm();
        this.orders.save(order);
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleep(BACKOFF_MS[attempt - 1]);
      }
    }
    this.stock.releaseReservation(orderId);
    order.fail("ERP_PROCESSING_FAILED", "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.");
    this.orders.save(order);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeoutAfter(ms: number): Promise<{ success: false }> {
    return new Promise((resolve) => setTimeout(() => resolve({ success: false }), ms));
  }
}
```

`CheckoutUseCase` is the one Application Service in this project: it sequences calls to `StockService`, the two repositories, `IdempotencyService`, and `ErpGateway` — it holds no business rule of its own that isn't a plain sequencing decision (e.g. "check idempotency before touching inventory"), per the constitution's definition of the Application layer. Note everything from the top of `execute()` through `this.stock.reserveStock(...)` is synchronous — no `await` appears until *after* the reservation decision is already made and `void this.settleWithErp(order.id)` is fired off without being awaited. That's what preserves the concurrency guarantee from Task 1: two overlapping calls to `execute()` can't interleave their reservation logic, no matter how the ERP call at the end behaves.

- [ ] **Step 11: Write `backend/src/checkout/checkout.controller.ts` and `checkout.module.ts`; modify `app.module.ts`**

```ts
// backend/src/checkout/checkout.controller.ts
import { Body, Controller, Headers, HttpCode, Post } from "@nestjs/common";
import { CheckoutUseCase } from "./application/checkout.use-case";
import { CheckoutRequestDto } from "./dto/checkout-request.dto";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly checkoutUseCase: CheckoutUseCase) {}

  @Post()
  @HttpCode(202)
  checkout(@Body() dto: CheckoutRequestDto, @Headers("Idempotency-Key") headerKey?: string) {
    return this.checkoutUseCase.execute(dto, headerKey);
  }
}
```

```ts
// backend/src/checkout/checkout.module.ts
import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutUseCase } from "./application/checkout.use-case";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/orders.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";
import { ErpModule } from "../erp/erp.module";

@Module({
  imports: [InventoryModule, OrdersModule, IdempotencyModule, ErpModule],
  controllers: [CheckoutController],
  providers: [CheckoutUseCase],
})
export class CheckoutModule {}
```

```ts
// backend/src/app.module.ts
import { Module } from "@nestjs/common";
import { InventoryModule } from "./inventory/inventory.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [InventoryModule, CheckoutModule, OrdersModule],
})
export class AppModule {}
```

The controller has no `try`/`catch` and no `if` branching on error type — every failure path is a thrown `DomainError` that the global `HttpExceptionFilter` from Task 1 already knows how to render. `@HttpCode(202)` only sets the status for the success return value; a thrown error's own mapped status (400/404/409) always wins.

- [ ] **Step 12: Run the happy-path test to verify it passes**

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 13: Add and run the validation-error test**

```ts
// append inside describe("POST /checkout (e2e)", ...) in backend/test/checkout.e2e-spec.ts
it("rejects a non-positive quantity with a validation error", async () => {
  const res = await request(app.getHttpServer())
    .post("/checkout")
    .send({ productId: "capinha-transparente", quantity: 0, idempotencyKey: uniqueKey() });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.field).toBe("quantity");
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 14: Add and run the missing-idempotency-key test**

```ts
it("rejects a request without an idempotency key", async () => {
  const res = await request(app.getHttpServer())
    .post("/checkout")
    .send({ productId: "capinha-transparente", quantity: 1 });

  expect(res.status).toBe(400);
  expect(res.body.error.code).toBe("VALIDATION_ERROR");
  expect(res.body.error.field).toBe("idempotencyKey");
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 15: Add and run the product-not-found test**

```ts
it("returns 404 for a product that does not exist", async () => {
  const res = await request(app.getHttpServer())
    .post("/checkout")
    .send({ productId: "produto-que-nao-existe", quantity: 1, idempotencyKey: uniqueKey() });

  expect(res.status).toBe(404);
  expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 16: Add and run the out-of-stock + concurrency test**

```ts
it("lets only one of two simultaneous purchases succeed for the last unit", async () => {
  process.env.ERP_SIM_MODE = "always-success";
  process.env.ERP_SIM_DELAY_MS = "10";

  const [resA, resB] = await Promise.all([
    request(app.getHttpServer()).post("/checkout").send({ productId: "capinha-listrada", quantity: 1, idempotencyKey: uniqueKey() }),
    request(app.getHttpServer()).post("/checkout").send({ productId: "capinha-listrada", quantity: 1, idempotencyKey: uniqueKey() }),
  ]);

  const statuses = [resA.status, resB.status].sort();
  expect(statuses).toEqual([202, 409]);
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS — `capinha-listrada` seeds with `stock: 1`, so this test only works once per process; that's fine since each `jest` run starts a fresh module state.

- [ ] **Step 17: Add and run the idempotency test**

```ts
it("returns the exact same response when the same idempotency key is sent twice", async () => {
  process.env.ERP_SIM_MODE = "always-success";
  process.env.ERP_SIM_DELAY_MS = "10";
  const key = uniqueKey();
  const payload = { productId: "capinha-preta", quantity: 1, idempotencyKey: key };

  const first = await request(app.getHttpServer()).post("/checkout").send(payload);
  const second = await request(app.getHttpServer()).post("/checkout").send(payload);

  expect(second.body).toEqual(first.body);
  expect(second.status).toBe(first.status);
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 18: Add and run the idempotency-via-header test**

```ts
it("accepts the idempotency key via the Idempotency-Key header instead of the body", async () => {
  process.env.ERP_SIM_MODE = "always-success";
  process.env.ERP_SIM_DELAY_MS = "10";
  const key = uniqueKey();

  const first = await request(app.getHttpServer())
    .post("/checkout")
    .set("Idempotency-Key", key)
    .send({ productId: "capinha-preta", quantity: 1 });
  const second = await request(app.getHttpServer())
    .post("/checkout")
    .set("Idempotency-Key", key)
    .send({ productId: "capinha-preta", quantity: 1 });

  expect(first.status).toBe(202);
  expect(second.body).toEqual(first.body);
});
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS

- [ ] **Step 19: Add and run the ERP fast-failure test**

```ts
it("marks the order as failed and releases stock when the ERP keeps failing", async () => {
  process.env.ERP_SIM_MODE = "always-fail";
  process.env.ERP_SIM_DELAY_MS = "10";

  const res = await request(app.getHttpServer())
    .post("/checkout")
    .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

  expect(res.status).toBe(202);

  await new Promise((resolve) => setTimeout(resolve, 3100)); // 2 backoffs of 1s+2s plus margin

  const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
  expect(statusRes.body.status).toBe("failed");
  expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
}, 8000);
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS (test's own timeout raised to 8s because it deliberately waits through two backoff windows)

- [ ] **Step 20: Add and run the ERP timeout test**

This is the one scenario that exercises `timeoutAfter` actually winning the `Promise.race` in `settleWithErp` — Step 19 only exercises the ERP responding quickly with failure, a different branch. `always-timeout` mode with a delay longer than `ERP_TIMEOUT_MS` (3000ms) guarantees every one of the 3 attempts loses the race to the timeout, so the order still ends up `failed`, but by the timeout path.

```ts
it("marks the order as failed when the ERP never responds within the timeout window", async () => {
  process.env.ERP_SIM_MODE = "always-timeout";
  process.env.ERP_SIM_DELAY_MS = "5000"; // longer than the 3s per-attempt timeout

  const res = await request(app.getHttpServer())
    .post("/checkout")
    .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

  expect(res.status).toBe(202);

  await new Promise((resolve) => setTimeout(resolve, 12500));

  const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
  expect(statusRes.body.status).toBe("failed");
  expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
}, 15000);
```

Run: `cd backend && npx jest --config ./test/jest-e2e.json`
Expected: PASS — this test deliberately takes ~12.5s of real wall-clock time; an accepted tradeoff for covering the timeout-race branch without introducing fake timers into a suite that otherwise uses real ones.

- [ ] **Step 21: Write the required unit tests — `inventory/domain/stock.service.spec.ts`**

```ts
// backend/src/inventory/domain/stock.service.spec.ts
import { StockService } from "./stock.service";
import { Product } from "./product.entity";
import { ProductRepository } from "./product.repository";
import { StockReservation } from "./stock-reservation.entity";
import { StockReservationRepository } from "./stock-reservation.repository";

class FakeProductRepository implements ProductRepository {
  constructor(private readonly products: Product[]) {}

  findById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  findAll(): Product[] {
    return this.products;
  }

  save(): void {}
}

class FakeStockReservationRepository implements StockReservationRepository {
  private readonly reservations = new Map<string, StockReservation>();

  save(reservation: StockReservation): void {
    this.reservations.set(reservation.orderId, reservation);
  }

  findByOrderId(orderId: string): StockReservation | undefined {
    return this.reservations.get(orderId);
  }

  findActive(): StockReservation[] {
    return [...this.reservations.values()].filter((r) => r.status === "active");
  }
}

describe("StockService", () => {
  it("reserves stock only while there is enough available", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 1)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    expect(stock.reserveStock("ord_1", "p1", 1)).toBe(true);
    expect(stock.reserveStock("ord_2", "p1", 1)).toBe(false);
  });

  it("returns reserved stock to availability on release, without touching the base stock", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 5)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    stock.reserveStock("ord_1", "p1", 1);
    expect(stock.availableStock("p1")).toBe(4);

    stock.releaseReservation("ord_1");
    expect(stock.availableStock("p1")).toBe(5);
  });

  it("permanently deducts stock on confirmation", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 5)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    stock.reserveStock("ord_1", "p1", 1);
    stock.confirmReservation("ord_1");

    expect(stock.availableStock("p1")).toBe(4);
  });
});
```

These use hand-rolled fakes implementing the repository *interfaces* directly, not `jest.fn()` mocks — the repositories are pure data storage with no behavior worth mocking, so a real (if tiny) implementation is simpler and more honest than a mock that would just re-implement a `Map` behind `jest.fn()` calls.

- [ ] **Step 22: Write the required unit tests — `checkout/application/checkout.use-case.spec.ts`**

```ts
// backend/src/checkout/application/checkout.use-case.spec.ts
import { CheckoutUseCase } from "./checkout.use-case";
import { ProductRepository } from "../../inventory/domain/product.repository";
import { StockService } from "../../inventory/domain/stock.service";
import { Product } from "../../inventory/domain/product.entity";
import { ProductNotFoundError } from "../../inventory/domain/errors/product-not-found.error";
import { OutOfStockError } from "../../inventory/domain/errors/out-of-stock.error";
import { OrderRepository } from "../../orders/domain/order.repository";
import { Order } from "../../orders/domain/order.entity";
import { IdempotencyService } from "../../idempotency/idempotency.service";
import { ErpGateway } from "../../erp/domain/erp-gateway";
import { InvalidInputError } from "../../shared/domain/errors/invalid-input.error";

describe("CheckoutUseCase", () => {
  let products: jest.Mocked<ProductRepository>;
  let stock: jest.Mocked<StockService>;
  let orders: jest.Mocked<OrderRepository>;
  let idempotency: jest.Mocked<IdempotencyService>;
  let erp: jest.Mocked<ErpGateway>;
  let useCase: CheckoutUseCase;

  beforeEach(() => {
    products = { findById: jest.fn(), findAll: jest.fn(), save: jest.fn() };
    stock = {
      reserveStock: jest.fn(),
      confirmReservation: jest.fn(),
      releaseReservation: jest.fn(),
      availableStock: jest.fn(),
    } as unknown as jest.Mocked<StockService>;
    orders = { create: jest.fn(), findById: jest.fn(), save: jest.fn() };
    idempotency = { getStoredResponse: jest.fn(), storeResponse: jest.fn() } as unknown as jest.Mocked<IdempotencyService>;
    erp = { call: jest.fn() };
    useCase = new CheckoutUseCase(products, stock, orders, idempotency, erp);
  });

  it("throws a validation error when no idempotency key is provided", async () => {
    await expect(useCase.execute({ productId: "p1", quantity: 1 } as any, undefined)).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it("throws a not-found error when the product does not exist", async () => {
    products.findById.mockReturnValue(undefined);

    await expect(useCase.execute({ productId: "does-not-exist", quantity: 1 } as any, "key-1")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it("throws an out-of-stock error and marks the order failed when the reservation fails", async () => {
    products.findById.mockReturnValue(new Product("p1", "P", 100, 0));
    const order = new Order("ord_1", "p1", 1, Date.now());
    orders.create.mockReturnValue(order);
    stock.reserveStock.mockReturnValue(false);

    await expect(useCase.execute({ productId: "p1", quantity: 1 } as any, "key-1")).rejects.toBeInstanceOf(OutOfStockError);
    expect(order.status).toBe("failed");
    expect(orders.save).toHaveBeenCalledWith(order);
  });

  it("returns the cached response instead of creating a second order for a repeated key", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.getStoredResponse.mockReturnValue(cached);

    const result = await useCase.execute({ productId: "p1", quantity: 1 } as any, "key-1");

    expect(result).toBe(cached);
    expect(orders.create).not.toHaveBeenCalled();
  });
});
```

Where the assertion can be made against real domain state (`order.status === "failed"`) instead of a mock call, it is — that's a stronger check than "was `orders.save` called," because it verifies `Order.fail()` itself behaved correctly, not just that some method was invoked.

- [ ] **Step 23: Run the full backend test suite (unit + e2e)**

Run: `cd backend && npm test && npm run test:e2e`
Expected: All tests PASS

- [ ] **Step 24: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(backend): implement POST /checkout and GET /orders/:id with DDD-layered Orders/Checkout/Erp contexts over HTTP-backed erp-mock"
```

---

### Task 4: Frontend scaffold and product list

Unaffected by the backend's move to DDD — the frontend only ever talks to the backend over HTTP, and the contract (routes, payloads, status codes) hasn't changed. Stack here was already constitution-compliant from the start (Vite + React + TypeScript, no Next.js; Vitest + React Testing Library).

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/App.tsx` (product list only for now)
- Create: `frontend/src/main.tsx`
- Create: `frontend/test/setup.ts`
- Test: `frontend/test/App.test.tsx`

**Interfaces:**
- Produces: `Product`, `fetchProducts(): Promise<Product[]>` (`api.ts`) — later steps in Task 5 add `postCheckout` and `fetchOrderStatus` to this same file
- Produces: `App` React component (`App.tsx`) — used by `main.tsx` and imported by tests

- [ ] **Step 1: Scaffold the frontend package**

```bash
mkdir -p frontend/src frontend/test
cd frontend
npm init -y
npm install react@^18.3.1 react-dom@^18.3.1
npm install -D typescript@^5.5.0 vite@^5.3.1 @vitejs/plugin-react@^4.3.1 vitest@^2.0.0 jsdom@^24.1.0 @testing-library/react@^16.0.0 @testing-library/jest-dom@^6.4.6 @testing-library/user-event@^14.5.2 @types/react@^18.3.3 @types/react-dom@^18.3.0
```

- [ ] **Step 2: Write `frontend/package.json` scripts**

```json
{
  "name": "casecellshop-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  }
}
```

(Dependency blocks from Step 1's `npm install` stay as generated — do not hand-edit versions.)

- [ ] **Step 3: Write `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 4: Write `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./test/setup.ts",
  },
});
```

- [ ] **Step 5: Write `frontend/index.html`**

```html
<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="UTF-8" />
    <title>CaseCellShop</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `frontend/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 7: Write the failing test for the product list**

```tsx
// frontend/test/App.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { App } from "../src/App";
import * as api from "../src/api";

vi.mock("../src/api");

describe("App - product list", () => {
  beforeEach(() => {
    vi.mocked(api.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5 },
    ]);
  });

  it("renders the products fetched from the API", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(/Capinha Preta Fosca/)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: FAIL — `Cannot find module '../src/App'`

- [ ] **Step 9: Write `frontend/src/api.ts`**

```ts
export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

const API_BASE = "/api";

export async function fetchProducts(): Promise<Product[]> {
  const res = await fetch(`${API_BASE}/products`);
  const data = await res.json();
  return data.products;
}
```

- [ ] **Step 10: Write `frontend/src/App.tsx` (product list only)**

```tsx
import { useEffect, useState } from "react";
import { fetchProducts, Product } from "./api";

export function App() {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts().then(setProducts);
  }, []);

  return (
    <main>
      <h1>CaseCellShop</h1>
      <ul>
        {products.map((p) => (
          <li key={p.id}>
            {p.name} — R$ {(p.priceCents / 100).toFixed(2)} — {p.stock} em estoque
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 11: Write `frontend/src/main.tsx`**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html frontend/src/api.ts frontend/src/App.tsx frontend/src/main.tsx frontend/test/setup.ts frontend/test/App.test.tsx
git commit -m "feat(frontend): scaffold project and render product list"
```

---

### Task 5: Frontend checkout flow — buy button, loading, and status messages

**Files:**
- Modify: `frontend/src/api.ts` — add `postCheckout` and `fetchOrderStatus`
- Modify: `frontend/src/App.tsx` — add quantity selection, buy button, loading/disabled state, status messages, polling
- Modify: `frontend/test/App.test.tsx` — add the checkout scenarios

**Interfaces:**
- Consumes: `Product` (from Task 4)
- Produces: `CheckoutResponse`, `OrderStatus`, `postCheckout(input: { productId: string; quantity: number; idempotencyKey: string }): Promise<{ statusCode: number; body: CheckoutResponse }>`, `fetchOrderStatus(orderId: string): Promise<OrderStatus>` (`api.ts`)

- [ ] **Step 1: Add `postCheckout` and `fetchOrderStatus` to `frontend/src/api.ts`**

```ts
export interface CheckoutSuccess {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

export interface ApiError {
  error: { code: string; message: string; field?: string };
}

export type CheckoutResponse = CheckoutSuccess | ApiError;

export interface OrderStatus {
  orderId: string;
  status: "pending" | "confirmed" | "failed";
  error?: { code: string; message: string };
}

export async function postCheckout(input: {
  productId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<{ statusCode: number; body: CheckoutResponse }> {
  const res = await fetch(`${API_BASE}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await res.json();
  return { statusCode: res.status, body };
}

export async function fetchOrderStatus(orderId: string): Promise<OrderStatus> {
  const res = await fetch(`${API_BASE}/orders/${orderId}`);
  return res.json();
}
```

- [ ] **Step 2: Write the failing test for the loading/disabled state**

```tsx
// append to frontend/test/App.test.tsx, new top-level describe
import userEvent from "@testing-library/user-event";

describe("App - checkout flow", () => {
  beforeEach(() => {
    vi.mocked(api.fetchProducts).mockResolvedValue([
      { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5 },
    ]);
  });

  it("disables the buy button and shows a loading message while processing", async () => {
    vi.mocked(api.postCheckout).mockReturnValue(new Promise(() => {})); // never resolves
    render(<App />);
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /comprar/i }));

    expect(screen.getByRole("button", { name: /processando/i })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(/processando sua compra/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: FAIL — no `combobox` or `button` role exists yet in the current `App.tsx`

- [ ] **Step 4: Rewrite `frontend/src/App.tsx` with the full checkout flow**

```tsx
import { useEffect, useState } from "react";
import { fetchProducts, postCheckout, fetchOrderStatus, Product } from "./api";

type CheckoutState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string };

export function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>({ kind: "idle" });

  useEffect(() => {
    fetchProducts().then((data) => {
      setProducts(data);
      if (data.length > 0) setSelectedProductId(data[0].id);
    });
  }, []);

  async function handleBuy() {
    setCheckoutState({ kind: "loading" });
    const idempotencyKey = crypto.randomUUID();
    const { statusCode, body } = await postCheckout({ productId: selectedProductId, quantity, idempotencyKey });

    if (statusCode === 202 && "orderId" in body) {
      pollOrderStatus(body.orderId);
      return;
    }
    if ("error" in body) {
      setCheckoutState({ kind: "error", message: body.error.message });
      return;
    }
    setCheckoutState({ kind: "error", message: "Ocorreu um erro inesperado. Tente novamente." });
  }

  async function pollOrderStatus(orderId: string) {
    const maxAttempts = 15;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await fetchOrderStatus(orderId);
      if (status.status === "confirmed") {
        setCheckoutState({ kind: "success", message: "Compra confirmada!" });
        return;
      }
      if (status.status === "failed") {
        setCheckoutState({
          kind: "error",
          message: status.error?.message ?? "Não conseguimos concluir seu pedido agora. Tente novamente.",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    setCheckoutState({
      kind: "error",
      message: "Está demorando mais que o esperado. Você pode conferir o status mais tarde.",
    });
  }

  const isLoading = checkoutState.kind === "loading";

  return (
    <main>
      <h1>CaseCellShop</h1>

      <label htmlFor="product-select">Produto</label>
      <select
        id="product-select"
        value={selectedProductId}
        onChange={(e) => setSelectedProductId(e.target.value)}
        disabled={isLoading}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — R$ {(p.priceCents / 100).toFixed(2)} — {p.stock} em estoque
          </option>
        ))}
      </select>

      <label htmlFor="quantity-input">Quantidade</label>
      <input
        id="quantity-input"
        type="number"
        min={1}
        value={quantity}
        onChange={(e) => setQuantity(Number(e.target.value))}
        disabled={isLoading}
      />

      <button onClick={handleBuy} disabled={isLoading || !selectedProductId}>
        {isLoading ? "Processando..." : "Comprar"}
      </button>

      {checkoutState.kind === "loading" && <p role="status">Processando sua compra...</p>}
      {checkoutState.kind === "success" && <p role="status">{checkoutState.message}</p>}
      {checkoutState.kind === "error" && <p role="alert">{checkoutState.message}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: PASS

- [ ] **Step 6: Add and run the out-of-stock message test**

```tsx
it("shows a friendly message when the product is out of stock", async () => {
  vi.mocked(api.postCheckout).mockResolvedValue({
    statusCode: 409,
    body: { error: { code: "OUT_OF_STOCK", message: "Este produto está esgotado no momento." } },
  });
  render(<App />);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /comprar/i }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(/esgotado/i);
  });
});
```

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: PASS

- [ ] **Step 7: Add and run the validation-error message test**

```tsx
it("shows the validation message when the quantity is invalid", async () => {
  vi.mocked(api.postCheckout).mockResolvedValue({
    statusCode: 400,
    body: { error: { code: "VALIDATION_ERROR", message: "A quantidade deve ser maior que zero.", field: "quantity" } },
  });
  render(<App />);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /comprar/i }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(/quantidade deve ser maior que zero/i);
  });
});
```

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: PASS

- [ ] **Step 8: Add and run the success-via-polling and failure-via-polling tests**

```tsx
it("polls order status and shows a success message once confirmed", async () => {
  vi.mocked(api.postCheckout).mockResolvedValue({
    statusCode: 202,
    body: { orderId: "ord_000001", status: "pending", statusUrl: "/orders/ord_000001" },
  });
  vi.mocked(api.fetchOrderStatus).mockResolvedValue({ orderId: "ord_000001", status: "confirmed" });
  render(<App />);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /comprar/i }));

  await waitFor(() => {
    expect(screen.getByRole("status")).toHaveTextContent(/compra confirmada/i);
  });
});

it("shows the failure message once polling reports a failed order", async () => {
  vi.mocked(api.postCheckout).mockResolvedValue({
    statusCode: 202,
    body: { orderId: "ord_000002", status: "pending", statusUrl: "/orders/ord_000002" },
  });
  vi.mocked(api.fetchOrderStatus).mockResolvedValue({
    orderId: "ord_000002",
    status: "failed",
    error: { code: "ERP_PROCESSING_FAILED", message: "Não conseguimos concluir seu pedido agora. Tente novamente em instantes." },
  });
  render(<App />);
  await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: /comprar/i }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(/não conseguimos concluir/i);
  });
});
```

Run: `cd frontend && npx vitest run test/App.test.tsx`
Expected: PASS — both scenarios resolve on the very first poll, so no test needs to wait through the 1-second polling interval.

- [ ] **Step 9: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/api.ts frontend/src/App.tsx frontend/test/App.test.tsx
git commit -m "feat(frontend): add checkout flow with loading, status polling, and error messages"
```

---

### Task 6: README and PROMPTS.md

**Files:**
- Create: `README.md`
- Create: `PROMPTS.md`

**Interfaces:**
- None — this task documents, it doesn't change behavior.

- [ ] **Step 1: Write `README.md`**

Cover, at minimum: how to install and run all three packages (`cd erp-mock && npm install && npm run dev`, `cd backend && npm install && npm run start:dev`, `cd frontend && npm install && npm run dev`, ports 4000/3001/5173), how to run the tests (`npm test` in `erp-mock/`; `npm test` for unit and `npm run test:e2e` for e2e in `backend/` — the e2e run starts and stops `erp-mock` on its own via `globalSetup`/`globalTeardown`, so it does not need to already be running; `npm test` in `frontend/`), why the ERP simulator is a separate real HTTP service instead of an in-process fake (more faithful to a real integration with an external system — see `plan.md`'s "Risk Management"), the backend's DDD layering (domain/application/infrastructure/presentation per bounded context) and why it was chosen (constitution mandate), the in-memory-instead-of-Redis decision and why it preserves the same atomicity guarantee (SPEC "Storage"), why idempotency only caches the success response (SPEC "Idempotency"), the list of what's out of scope and why (copy from `spec.md`'s Out of Scope section), and a link to [`specs/spec.md`](specs/spec.md), [`specs/constitution.md`](specs/constitution.md), [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md), and [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md) for the full reasoning — README.md lives at the repo root, so these paths are already root-relative; don't copy them verbatim from elsewhere in this plan, where the same files are one level up (`../`).

- [ ] **Step 2: Write `PROMPTS.md`**

Start it now and append the relevant prompts used for the remaining tasks as they happen — don't reconstruct it from memory at the end.

- [ ] **Step 3: Commit**

```bash
git add README.md PROMPTS.md
git commit -m "docs: add README and PROMPTS.md"
```

---

## Self-Review Notes

- **Spec coverage**: every `Implementation Decisions` bullet in `spec.md` maps to a step above (Inventory domain/infrastructure in Task 1; the ERP mock service in Task 2; Orders/idempotency/Erp gateway/checkout use case/domain errors/filter in Task 3; frontend pieces in Tasks 4–5). Every `Testing Decisions` scenario — including the constitution-driven unit-test requirement and the ERP mock's own test seam — has a corresponding step. `Out of Scope` items are deliberately absent from every task.
- **Constitution compliance**: DDD layering realized concretely — entities (`Product`, `StockReservation`, `Order`) enforce their own invariants and state transitions; repository *interfaces* (ports) live in `domain/`, injected everywhere by Symbol token, with concrete adapters isolated in `infrastructure/`; `CheckoutUseCase` is the one Application Service and holds no business rule of its own; domain errors are plain `DomainError` subclasses with zero HTTP awareness, mapped to status codes exactly once in the global `HttpExceptionFilter`; the idempotency cache is the deliberate, documented YAGNI exception to the port/adapter pattern; `erp-mock`'s deliberate exemption from the NestJS/DDD mandate is documented in the constitution itself, not assumed. Every file follows the kebab-case `<name>.<role>.ts` convention. DTO + global `ValidationPipe` (no manual body-validation in a controller), one module/one responsibility (with the `InventoryModule`-owns-`StockService` exception explicitly justified against the circular-import alternative), `*.spec.ts` unit tests for the two places with actual branching logic, `*.e2e-spec.ts` for every endpoint — each rule from the constitution's "Architecture and Clean Code" and "Testing" sections has a concrete step realizing it, not just a mention.
- **Concurrency proof**: Task 1 Step 12's note and Task 3 Step 16's test together show *why* the last-unit race is safe under Nest's DI, not just assert that it is — this was the single highest-risk behavior in the whole spec (ADR-002). `erp-mock`'s header-driven, stateless design (Task 2) extends the same guarantee across the new process boundary: two concurrent e2e requests can never cross-contaminate each other's simulated ERP behavior, the same isolation the old in-process `process.env` design had by construction.
- **Type consistency check**: `CheckoutSuccessBody`, `Order`/`OrderStatus`, and the frontend's `api.ts` types were kept identical in wording across Tasks 3 and 5 (`status: "pending" | "confirmed" | "failed"`, `error: { code, message }`) — no renamed fields between backend and frontend. Repository port method names (`findById`, `findAll`, `save`, `create`) are used consistently by every adapter and every consumer across Tasks 1 and 3.
