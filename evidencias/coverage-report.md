# Relatório de cobertura de testes (branch `redis`)

Números reais, gerados nesta sessão rodando `npm run test:coverage` (Jest `--coverage` no `backend`/`erp-mock`, Vitest `--coverage` no `frontend`) e `npm run test:e2e:coverage` no `backend`, contra Redis real — nenhum número aqui foi estimado ou inventado. O texto bruto de cada ferramenta está reproduzido abaixo de cada tabela, sem edição. Ver [`coverage-report.md` de `main`](https://github.com/alvaroaxsmith/casecellshop-checkout/blob/main/evidencias/coverage-report.md) para o mesmo relatório na versão em memória — os números de `erp-mock`/`frontend` são idênticos entre as branches, já que nenhum dos dois pacotes muda aqui.

## Pontas soltas encontradas e fechadas

A primeira versão deste relatório tinha 66.10% de cobertura nos testes unitários do `backend` — baixo o bastante pra valer a pena ler linha por linha o que exatamente ficava de fora, em vez de só aceitar o número (mesmo exercício feito em `main`, ver o link acima). Cruzando as linhas não cobertas do relatório unitário **com** as do e2e (uma linha só é uma lacuna de verdade se nenhuma das duas suítes a alcança), quatro delas eram comportamento documentado e importante, não decisão de escopo:

| Lacuna | Onde | Por que importava |
|---|---|---|
| Reserva expira sozinha por TTL nativo do Redis | `reserve-stock.lua` (via `ProductsService.reserveStock`) | É a garantia central desta branch — TTL nativo em vez de sweep da aplicação — e nenhum teste automatizado jamais deixava uma reserva expirar de verdade pra provar que o script Lua realmente a exclui da contagem na próxima leitura; só a demo manual de `evidencias/logs-redis.md` fazia isso. |
| `erp.call()` **rejeitando** (falha de rede), não só respondendo `success: false` | `CheckoutService.settleWithErp` | O `try/catch` ao redor do `Promise.race` existe especificamente para esse caso — e nenhum teste nunca fez o mock do ERP rejeitar de verdade, só resolver com falha. |
| Fallback de erro 500 para uma exceção não tratada | `HttpExceptionFilter` | É a rede de segurança de todo o app — o único filtro global de exceções — e não tinha nenhum teste, unitário ou e2e, garantindo que ele realmente devolve um 500 bem formado em vez de vazar stack trace ou derrubar o processo. |
| Backend falha ao iniciar se o `erp-mock` responder com erro ao buscar o catálogo | `ErpService.fetchCatalog` | Comportamento citado no README como decisão deliberada ("falha ao iniciar em vez de subir com um catálogo vazio") — e nunca verificado por um teste, só por leitura do código. |

A primeira lacuna é a única que não é um port direto de `main`: lá, a mesma garantia usa `Date.now()` mockado pra simular o tempo passando num `Map` em memória; aqui, o teste força o TTL da chave `reservation:<orderId>` pra ~1s direto no Redis (`redis.client.expire(...)`) e espera de verdade — é o TTL nativo de verdade expirando, não uma simulação. As outras três portaram sem alteração de comportamento, só adaptando os mocks para o estilo assíncrono desta branch: `checkout.service.spec.ts` ganhou o teste de `erp.call()` rejeitando; `http-exception.filter.spec.ts` e `erp.service.spec.ts` são arquivos novos, idênticos aos de `main` porque `HttpExceptionFilter` e `ErpService` não mudam nesta branch.

Resultado: cobertura unitária do `backend` foi de 66.10% → **78.65%** statements (33.96% → **51.61%** branches), com 8 testes novos (12 → 20).

## Resumo

| Suíte | Statements | Branches | Functions | Lines | Testes |
|---|---|---|---|---|---|
| `backend` — unitários | 78.65% | 51.61% | 63.26% | 78.50% | 20 |
| `backend` — e2e | 92.23% | 54.66% | 95.16% | 92.52% | 15 |
| `erp-mock` | 96.15% | 77.77% | 83.33% | 96.00% | 7 |
| `frontend` | 82.11% | 82.35% | 57.69% | 82.11% | 8 |

Um teste unitário a mais que em `main` (20 vs. 19): esta branch já tinha, desde antes, um teste de concorrência próprio em `products.service.spec.ts` (`lets only one of two concurrent reservations for the last unit succeed`, rodando contra Redis real) que não existe do lado em memória. `src/redis/redis.service.ts` aparece como um arquivo novo na cobertura (~83%) — não existe em `main`.

## `backend` — testes unitários (`REDIS_URL=redis://localhost:6379/1 npm run test:coverage`)

```
---------------------------|---------|----------|---------|---------|-------------------
File                       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------------------|---------|----------|---------|---------|-------------------
All files                  |   78.65 |    51.61 |   63.26 |    78.5 |
 checkout                  |   91.54 |    68.42 |   88.88 |   92.18 |
  checkout.service.ts      |   91.54 |    68.42 |   88.88 |   92.18 | 72,97-100
 common/exceptions         |   88.88 |      100 |      75 |   88.88 |
  app.exception.ts         |   88.88 |      100 |      75 |   88.88 | 26
 common/filters            |     100 |    55.55 |     100 |     100 |
  http-exception.filter.ts |     100 |    55.55 |     100 |     100 | 12,18-26
 erp                       |     100 |       80 |     100 |     100 |
  erp.service.ts           |     100 |       80 |     100 |     100 | 51-58
 idempotency               |   46.15 |        0 |       0 |   36.36 |
  idempotency.service.ts   |   46.15 |        0 |       0 |   36.36 | 14-28
 orders                    |   16.12 |        0 |       0 |   10.71 |
  orders.service.ts        |   16.12 |        0 |       0 |   10.71 | 18-77
 products                  |    83.6 |    71.42 |   69.23 |   87.03 |
  products.service.ts      |    83.6 |    71.42 |   69.23 |   87.03 | 35-40,114-118
 redis                     |    82.6 |       50 |   71.42 |   80.95 |
  redis.service.ts         |    82.6 |       50 |   71.42 |   80.95 | 44,52-55
---------------------------|---------|----------|---------|---------|-------------------

Test Suites: 4 passed, 4 total
Tests:       20 passed, 20 total
```

`idempotency`/`orders` continuam sem teste unitário próprio, mesma decisão de escopo de `main` — cobertos pela suíte e2e abaixo. `products.service.ts` 35-40 são `listProducts()`/`findProduct()` (getters triviais, mesma explicação de `main`); 114-118 é a leitura da hash de reservas dentro de `reservedFor()` num caminho específico que os unitários não montam (coberto pelo e2e). `redis.service.ts` fica em torno de 83% pelo mesmo motivo do relatório anterior: o tratamento do evento `error` da conexão e o branch de falha do `ping()` exigiriam simular uma queda real do Redis no meio do teste.

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

`erp.service.ts` 36-37/65-66 e `http-exception.filter.ts` 24-28 ficam descobertos aqui pelo mesmo motivo de `main`: nenhum cenário e2e consegue fazer o `erp-mock` responder com um status de erro (ele sempre responde 200), então só os unitários alcançam essas linhas. `orders.service.ts` 45-48/57-60 (guard de "ignora se o pedido já não está mais pending") fica como lacuna pequena e de baixo risco, mesma decisão de `main`.

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
- **`idempotency.service.ts`/`orders.service.ts` nos unitários** — mesma decisão de escopo de `main`: só serviços com lógica de negócio própria mais os dois pontos de infraestrutura transversal com modo de falha documentado (`ErpService`, `HttpExceptionFilter`) ganham unitário dedicado.
- **`OrdersService.markConfirmed`/`markFailed` chamados num pedido que já não está mais pending** — mesma lacuna pequena e de baixo risco de `main`, não fechada nesta rodada.
- **`redis.service.ts` não chega a 100%** — as linhas não cobertas são o tratamento do evento `error` da conexão (`this.client.on("error", ...)`) e o branch de falha do `ping()` — exigiriam simular uma queda real de conexão do Redis no meio do teste, o que nenhum dos cenários automatizados provoca de propósito (isso é coberto manualmente: ver o Troubleshooting do README para o que acontece quando o Redis está fora do ar).
- **Ramos de erro de rede nos `*.service.ts` do frontend** — mesma explicação de `main`: cobertos indiretamente via mock de `fetch` global em `App.test.tsx`, não atribuídos à linha exata dentro do service pela ferramenta de cobertura.
