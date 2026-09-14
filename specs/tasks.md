# Tasks — Part 1.B: Checkout (CaseCellShop)

Checklist derived from [`plan.md`](plan.md).

**Task state legend** — update the marker as work happens, not only when a step is finished: `- [ ]` pending, `- [~]` in progress (started but not yet passing/committed), `- [x]` done (implemented, tests passing, committed). A step left at `[~]` across a session boundary tells whoever resumes exactly where things stand — never leave a step silently half-done with a stale `[ ]`.

## Task 1: Backend scaffold (NestJS), Products (catalog + stock), and `GET /products`

- [x] Scaffold the backend package (`npm init`, install NestJS + Jest dependencies)
- [x] Write the scripts and Jest unit-test config in `backend/package.json`
- [x] Write `backend/tsconfig.json`
- [x] Write `backend/tsconfig.build.json`
- [x] Write `backend/nest-cli.json`
- [x] Write `backend/test/jest-e2e.json`
- [x] Write `backend/src/common/exceptions/app.exception.ts` (typed exceptions extending `HttpException` directly — `ValidationFailedException`, `ProductNotFoundException`, `OutOfStockException`, `OrderNotFoundException`)
- [x] Write `backend/src/common/filters/http-exception.filter.ts`
- [x] Write `backend/src/bootstrap.ts` (`configureApp`: global `ValidationPipe` + `HttpExceptionFilter`)
- [x] Write `backend/src/products/products.service.ts` (catalog + stock reservation together, in-memory `Map`s — check-and-reserve as one synchronous operation)
- [x] Write `backend/src/products/products.controller.ts`
- [x] Write `backend/src/products/products.module.ts`, `backend/src/app.module.ts`, and `backend/src/main.ts`
- [x] Write `backend/test/utils/create-test-app.ts` and the (failing) e2e test for `GET /products`
- [x] Run the test and confirm it fails, then re-run until it passes
- [x] Commit

## Task 2: ERP mock service (`erp-mock/`)

- [x] Scaffold the `erp-mock` package (`npm init`, install Express + Jest/Supertest dependencies)
- [x] Write the scripts and Jest config in `erp-mock/package.json`
- [x] Write `erp-mock/tsconfig.json`
- [x] Write the (failing) test for `POST /erp/orders` and `GET /health` (`erp-mock/test/app.spec.ts`) — one case per simulate mode, one for the delay header, one for the header-less default
- [x] Run the test and confirm it fails
- [x] Write `erp-mock/src/app.ts` (header-driven `X-Erp-Simulate-Mode`/`X-Erp-Simulate-Delay-Ms`, stateless per request)
- [x] Write `erp-mock/src/main.ts`
- [x] Run the test and confirm it passes
- [x] Commit

## Task 3: Checkout core — `POST /checkout` and `GET /orders/:id`

- [x] Confirm `PRODUCT_NOT_FOUND`/`OUT_OF_STOCK`/`ORDER_NOT_FOUND` all extend `HttpException` with the right status in `backend/src/common/exceptions/app.exception.ts`
- [x] Write `backend/src/orders/orders.service.ts`, `orders.controller.ts`, `orders.module.ts`
- [x] Write `backend/src/idempotency/idempotency.service.ts` and `idempotency.module.ts`
- [x] Write `backend/src/erp/erp.service.ts` (calls `erp-mock` over HTTP via `fetch`, forwarding `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` as headers) and `erp.module.ts`
- [x] Write `backend/test/global-setup.ts` and `backend/test/global-teardown.ts` (spawn/kill `erp-mock` for the e2e run, polling `/health`); modify `backend/test/jest-e2e.json` to reference them
- [x] Write the (failing) e2e test for the happy path
- [x] Run the test and confirm it fails
- [x] Write `backend/src/checkout/checkout.dto.ts`
- [x] Write `backend/src/checkout/checkout.service.ts`
- [x] Write `backend/src/checkout/checkout.controller.ts` and `checkout.module.ts`; wire both into `app.module.ts`
- [x] Run the happy-path test and confirm it passes
- [x] Add and run the validation-error test
- [x] Add and run the missing-`idempotencyKey` test
- [x] Add and run the product-not-found test
- [x] Add and run the insufficient-stock + concurrency test
- [x] Add and run the idempotency test (via payload)
- [x] Add and run the idempotency-via-`Idempotency-Key`-header test
- [x] Add and run the ERP fast-failure test
- [x] Add and run the ERP timeout test
- [x] Write the required unit tests for `ProductsService` (`backend/src/products/products.service.spec.ts`, using hand-rolled fakes)
- [x] Write the required unit tests for `CheckoutService` (`backend/src/checkout/checkout.service.spec.ts`, using `jest.Mocked<>`)
- [x] Run the full backend test suite (unit + e2e)
- [x] Commit

## Task 4: Frontend scaffold and product list

- [x] Create the frontend package (`npm init`, install dependencies)
- [x] Write the scripts in `frontend/package.json`
- [x] Write `frontend/tsconfig.json`
- [x] Write `frontend/vite.config.ts`
- [x] Write `frontend/index.html`
- [x] Write `frontend/test/setup.ts`
- [x] Write the (failing) test for the product list
- [x] Run the test and confirm it fails
- [x] Write `frontend/src/api.ts`
- [x] Write `frontend/src/App.tsx` (product list only for now)
- [x] Write `frontend/src/main.tsx`
- [x] Run the test and confirm it passes
- [x] Commit

## Task 5: Frontend checkout flow — button, loading, messages

- [x] Add `postCheckout` and `fetchOrderStatus` to `frontend/src/api.ts`
- [x] Write the (failing) test for the loading/disabled-button state
- [x] Run the test and confirm it fails
- [x] Rewrite `frontend/src/App.tsx` with the full checkout flow
- [x] Run the test and confirm it passes
- [x] Add and run the out-of-stock message test
- [x] Add and run the validation-error message test
- [x] Add and run the success and failure via-polling tests
- [x] Run the full frontend test suite
- [x] Commit

## Task 6: README and PROMPTS.md

- [x] Write `README.md` (install/run for all three packages — `erp-mock`, `backend`, `frontend` — plus test commands and design decisions)
- [x] Commit
- [x] Write `PROMPTS.md`

## Final review

- [ ] Full branch review (all tasks)
