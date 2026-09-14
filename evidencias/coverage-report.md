# Relatório de cobertura de testes (branch `redis`)

Números reais, gerados nesta sessão rodando `npm run test:coverage` (Jest `--coverage` no `backend`/`erp-mock`, Vitest `--coverage` no `frontend`) e `npm run test:e2e:coverage` no `backend`, contra Redis real — nenhum número aqui foi estimado ou inventado. O texto bruto de cada ferramenta está reproduzido abaixo de cada tabela, sem edição. Ver [`coverage-report.md` de `main`](https://github.com/alvaroaxsmith/casecellshop-checkout/blob/main/evidencias/coverage-report.md) para o mesmo relatório na versão em memória — os números de `erp-mock`/`frontend` são idênticos entre as branches, já que nenhum dos dois pacotes muda aqui.

## Resumo

| Suíte | Statements | Branches | Functions | Lines | Testes |
|---|---|---|---|---|---|
| `backend` — unitários | 66.10% | 33.96% | 53.19% | 64.78% | 12 |
| `backend` — e2e | 92.23% | 54.66% | 95.16% | 92.52% | 15 |
| `erp-mock` | 96.15% | 77.77% | 83.33% | 96.00% | 7 |
| `frontend` | 82.11% | 82.35% | 57.69% | 82.11% | 8 |

Um teste unitário a mais que em `main` (12 vs. 11): `products.service.spec.ts` desta branch já tinha um teste de concorrência próprio (`lets only one of two concurrent reservations for the last unit succeed`, rodando contra Redis real) que não existe do lado em memória. `src/redis/redis.service.ts` aparece como um arquivo novo na cobertura (~83%) — não existe em `main`.

## `backend` — testes unitários (`REDIS_URL=redis://localhost:6379/1 npm run test:coverage`)

```
-------------------------|---------|----------|---------|---------|-------------------
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|-------------------
All files                |    66.1 |    33.96 |   53.19 |   64.78 |
 checkout                |   88.73 |    63.15 |   88.88 |   89.06 |
  checkout.service.ts    |   88.73 |    63.15 |   88.88 |   89.06 | 72,91-94,97-100
 common/exceptions       |   88.88 |      100 |      75 |   88.88 |
  app.exception.ts       |   88.88 |      100 |      75 |   88.88 | 26
 erp                     |   14.28 |        0 |       0 |    7.69 |
  erp.service.ts         |   14.28 |        0 |       0 |    7.69 | 17,22-71
 idempotency             |   46.15 |        0 |       0 |   36.36 |
  idempotency.service.ts |   46.15 |        0 |       0 |   36.36 | 14-28
 orders                  |   16.12 |        0 |       0 |   10.71 |
  orders.service.ts      |   16.12 |        0 |       0 |   10.71 | 18-77
 products                |    83.6 |    71.42 |   69.23 |   87.03 |
  products.service.ts    |    83.6 |    71.42 |   69.23 |   87.03 | 35-40,114-118
 redis                   |    82.6 |       50 |   71.42 |   80.95 |
-------------------------|---------|----------|---------|---------|-------------------

Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
```

`erp`/`idempotency`/`orders` continuam sem teste unitário próprio, mesma decisão de escopo de `main` — cobertos pela suíte e2e abaixo. `redis.service.ts` fica em torno de 83% porque a conexão real com o Redis e o registro dos três scripts Lua (`defineCommand`) são exercitados pelos próprios testes de `ProductsService` que rodam contra Redis de verdade.

## `backend` — testes e2e (`npm run test:e2e:coverage`)

```
-------------------------------|---------|----------|---------|---------|-----------------------------------
File                           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------------|---------|----------|---------|---------|-----------------------------------
All files                      |   92.23 |    54.66 |   95.16 |   92.52 |
 src                           |   95.83 |       40 |     100 |     100 |
  app.module.ts                |     100 |      100 |     100 |     100 |
  bootstrap.ts                 |   93.33 |       40 |     100 |     100 | 12-13
 src/checkout                  |   96.07 |    63.15 |    90.9 |    96.7 |
  checkout.controller.ts       |     100 |      100 |     100 |     100 |
  checkout.dto.ts              |     100 |      100 |     100 |     100 |
  checkout.module.ts           |     100 |      100 |     100 |     100 |
  checkout.service.ts          |   94.36 |    63.15 |   88.88 |   95.31 | 72,91-94
 src/common/dto                |     100 |      100 |     100 |     100 |
  error-response.dto.ts        |     100 |      100 |     100 |     100 |
 src/common/exceptions         |     100 |      100 |     100 |     100 |
  app.exception.ts             |     100 |      100 |     100 |     100 |
 src/common/filters            |   88.23 |    44.44 |     100 |   86.66 |
  http-exception.filter.ts     |   88.23 |    44.44 |     100 |   86.66 | 24-28
 src/common/middleware         |      95 |    83.33 |     100 |     100 |
  request-logger.middleware.ts |      95 |    83.33 |     100 |     100 | 28
 src/erp                       |   87.87 |       40 |     100 |    86.2 |
  erp.module.ts                |     100 |      100 |     100 |     100 |
  erp.service.ts               |   85.71 |       40 |     100 |   84.61 | 36-37,65-66
 src/idempotency               |     100 |      100 |     100 |     100 |
  idempotency.module.ts        |     100 |      100 |     100 |     100 |
  idempotency.service.ts       |     100 |      100 |     100 |     100 |
 src/orders                    |   93.44 |    53.84 |     100 |   92.45 |
  order.dto.ts                 |     100 |      100 |     100 |     100 |
  orders.controller.ts         |     100 |      100 |     100 |     100 |
  orders.module.ts             |     100 |      100 |     100 |     100 |
  orders.service.ts            |   87.09 |    45.45 |     100 |   85.71 | 45-48,57-60
 src/products                  |   86.95 |    28.57 |     100 |   87.65 |
  product.dto.ts               |     100 |      100 |     100 |     100 |
  products.controller.ts       |     100 |      100 |     100 |     100 |
  products.module.ts           |     100 |      100 |     100 |     100 |
  products.service.ts          |   80.32 |    28.57 |     100 |   81.48 | 65-68,86-89,97-98,107-108,117-118
 src/redis                     |   85.71 |       50 |   71.42 |   83.33 |
  redis.service.ts             |    82.6 |       50 |   71.42 |   80.95 | 44,52-55
-------------------------------|---------|----------|---------|---------|-----------------------------------

Test Suites: 3 passed, 3 total
Tests:       15 passed, 15 total
```

## `erp-mock` (`npm run test:coverage`)

```
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   96.15 |    77.77 |   83.33 |      96 |
 app.ts   |   96.15 |    77.77 |   83.33 |      96 | 76
----------|---------|----------|---------|---------|-------------------

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

## `frontend` (`npm run test:coverage`)

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   82.11 |    82.35 |   57.69 |   82.11 |
 src               |   30.76 |       50 |      50 |   30.76 |
  App.tsx          |     100 |      100 |     100 |     100 |
  main.tsx         |       0 |        0 |       0 |       0 | 1-10
 src/controller    |     100 |      100 |     100 |     100 |
  ...ontroller.tsx |     100 |      100 |     100 |     100 |
 src/hooks         |   82.89 |    77.77 |      80 |   82.89 |
  useCheckout.ts   |   79.03 |    73.33 |      75 |   79.03 | ...48,57-59,74-79
  useProducts.ts   |     100 |      100 |     100 |     100 |
 src/services      |   17.39 |      100 |       0 |   17.39 |
  ...ut.service.ts |    9.09 |      100 |       0 |    9.09 | 15-27
  http.ts          |     100 |      100 |     100 |     100 |
  ...rs.service.ts |      20 |      100 |       0 |      20 | 9-12
  ...ts.service.ts |   16.66 |      100 |       0 |   16.66 | 12-16
 src/utils         |   61.53 |      100 |      50 |   61.53 |
  classnames.ts    |     100 |      100 |     100 |     100 |
  format.ts        |     100 |      100 |     100 |     100 |
  ...uct-images.ts |   28.57 |      100 |       0 |   28.57 | 5-7,10-11
 src/view          |   94.44 |    83.33 |      60 |   94.44 |
  ...koutPanel.tsx |     100 |      100 |     100 |     100 |
  Header.tsx       |     100 |      100 |     100 |     100 |
  ProductCard.tsx  |   83.67 |       20 |      50 |   83.67 | 39-46
  ProductGrid.tsx  |     100 |      100 |     100 |     100 |
  ...tyStepper.tsx |     100 |      100 |      25 |     100 |
  StatusBanner.tsx |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------

Test Files  1 passed (1)
     Tests  8 passed (8)
```

Idêntico a `main` — nenhum destes dois pacotes muda nesta branch.

## O que fica de fora de propósito, e por quê

- **`main.ts`/`bootstrap.ts` (backend) e `main.tsx` (frontend)** — código de inicialização de processo. A suíte `e2e/` (Playwright) já prova que o processo sobe e funciona de ponta a ponta, Redis incluso.
- **`erp.service.ts`/`orders.service.ts` nos unitários** — mesma decisão de escopo de `main`, registrada em `specs/spec.md`: só `ProductsService`/`CheckoutService` têm teste unitário dedicado; o resto é coberto via e2e.
- **`redis.service.ts` não chega a 100%** — as linhas não cobertas são o tratamento do evento `error` da conexão (`this.client.on("error", ...)`) e o branch de falha do `ping()` — exigiriam simular uma queda real de conexão do Redis no meio do teste, o que nenhum dos cenários automatizados provoca de propósito (isso é coberto manualmente: ver o Troubleshooting do README para o que acontece quando o Redis está fora do ar).
- **Ramos de erro de rede nos `*.service.ts` do frontend** — mesma explicação de `main`: cobertos indiretamente via mock de `fetch` global em `App.test.tsx`, não atribuídos à linha exata dentro do service pela ferramenta de cobertura.
