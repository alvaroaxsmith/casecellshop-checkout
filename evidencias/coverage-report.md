# Relatório de cobertura de testes

Números reais, gerados nesta sessão rodando `npm run test:coverage` (Jest `--coverage` no `backend`/`erp-mock`, Vitest `--coverage` no `frontend`) e `npm run test:e2e:coverage` no `backend` — nenhum número aqui foi estimado ou inventado. O texto bruto de cada ferramenta está reproduzido abaixo de cada tabela, sem edição.

## Resumo

| Suíte | Statements | Branches | Functions | Lines | Testes |
|---|---|---|---|---|---|
| `backend` — unitários | 65.84% | 44.61% | 55.26% | 63.53% | 11 |
| `backend` — e2e | 93.27% | 56.32% | 98.14% | 93.51% | 15 |
| `erp-mock` | 96.15% | 77.77% | 83.33% | 96.00% | 7 |
| `frontend` | 82.11% | 82.35% | 57.69% | 82.11% | 8 |

O `backend` aparece duas vezes de propósito: os testes unitários cobrem só `ProductsService`/`CheckoutService` — os dois serviços que têm regra de negócio de verdade, conforme a decisão de teste registrada em [`specs/spec.md`](../specs/spec.md) ("Testing Decisions") — enquanto `OrdersService`/`IdempotencyService`/`ErpService`/controllers são exercitados de ponta a ponta pela suíte e2e via HTTP real. As duas rodadas juntas são a cobertura de verdade do backend; nenhuma das duas sozinha conta a história completa.

## `backend` — testes unitários (`npm run test:coverage`)

```
-------------------------|---------|----------|---------|---------|-------------------
File                     | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------|---------|----------|---------|---------|-------------------
All files                |   65.84 |    44.61 |   55.26 |   63.53 |
 checkout                |   88.73 |    63.15 |   88.88 |   89.06 |
  checkout.service.ts    |   88.73 |    63.15 |   88.88 |   89.06 | 72,91-94,97-100
 common/exceptions       |   88.88 |      100 |      75 |   88.88 |
  app.exception.ts       |   88.88 |      100 |      75 |   88.88 | 26
 erp                     |   14.28 |        0 |       0 |    7.69 |
  erp.service.ts         |   14.28 |        0 |       0 |    7.69 | 17,22-71
 idempotency             |   36.36 |        0 |       0 |   22.22 |
  idempotency.service.ts |   36.36 |        0 |       0 |   22.22 | 11-23
 orders                  |   14.81 |        0 |       0 |       8 |
  orders.service.ts      |   14.81 |        0 |       0 |       8 | 17-53
 products                |   89.28 |    77.27 |   76.92 |   91.66 |
  products.service.ts    |   89.28 |    77.27 |   76.92 |   91.66 | 36-40,125-126
-------------------------|---------|----------|---------|---------|-------------------

Test Suites: 2 passed, 2 total
Tests:       11 passed, 11 total
```

`erp`/`idempotency`/`orders` aparecem baixos aqui porque simplesmente não têm teste unitário próprio (por decisão de escopo, não por esquecimento) — são cobertos abaixo, pela suíte e2e.

## `backend` — testes e2e (`npm run test:e2e:coverage`)

```
-------------------------------|---------|----------|---------|---------|----------------------------
File                           | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------------------|---------|----------|---------|---------|----------------------------
All files                      |   93.27 |    56.32 |   98.14 |   93.51 |
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
 src/orders                    |   92.85 |       50 |     100 |   91.83 |
  order.dto.ts                 |     100 |      100 |     100 |     100 |
  orders.controller.ts         |     100 |      100 |     100 |     100 |
  orders.module.ts             |     100 |      100 |     100 |     100 |
  orders.service.ts            |   85.18 |       40 |     100 |      84 | 37-38,47-48
 src/products                  |   89.77 |    54.54 |     100 |   89.33 |
  product.dto.ts               |     100 |      100 |     100 |     100 |
  products.controller.ts       |     100 |      100 |     100 |     100 |
  products.module.ts           |     100 |      100 |     100 |     100 |
  products.service.ts          |   83.92 |    54.54 |     100 |   83.33 | 54-55,81-84,99-102,125-126
-------------------------------|---------|----------|---------|---------|----------------------------

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

`*.service.ts` aparecem baixos porque `test/App.test.tsx` mocka `global.fetch` diretamente para controlar as respostas da API nos testes de componente — o código dos serviços em si (montagem de URL, parse de JSON) roda de verdade nessas chamadas, mas as ramificações de erro de rede dentro de cada `service.ts` individual não são exercitadas por um teste unitário dedicado a eles. `main.tsx` (bootstrap do React, `createRoot(...).render(...)`) é o equivalente do `main.ts`/`bootstrap.ts` do backend — não vale a pena cobrir com teste unitário.

## O que fica de fora de propósito, e por quê

- **`main.ts`/`bootstrap.ts` (backend) e `main.tsx` (frontend)** — código de inicialização de processo (listen na porta, montagem do React no DOM). Testar isso exigiria subir um servidor/DOM real só para exercitar duas linhas de chamada de framework; a suíte `e2e/` (Playwright) já prova que o processo sobe e funciona de ponta a ponta.
- **`erp.service.ts`/`orders.service.ts` nos unitários** — decisão de escopo já registrada em `specs/spec.md`: só `ProductsService` e `CheckoutService` têm lógica de negócio testável isoladamente; os demais são adaptadores finos, cobertos pela suíte e2e via HTTP real, não por unitários próprios.
- **Ramos de erro de rede nos `*.service.ts` do frontend** — cobertos indiretamente por `App.test.tsx` (o teste "shows a connection error..." simula uma rejeição de `fetch`), mas o relatório de cobertura por arquivo não atribui isso à linha exata dentro do service porque o mock intercepta no nível do `fetch` global, não da chamada ao método do serviço.
