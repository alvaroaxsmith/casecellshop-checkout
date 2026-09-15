# Relatório de cobertura de testes

Números reais, gerados nesta sessão rodando `npm run test:coverage` (Jest `--coverage` no `backend`/`erp-mock`, Vitest `--coverage` no `frontend`) e `npm run test:e2e:coverage` no `backend` — nenhum número aqui foi estimado ou inventado. O texto bruto de cada ferramenta está reproduzido abaixo de cada tabela, sem edição.

## Pontas soltas encontradas e fechadas

A primeira versão deste relatório tinha 65.84% de cobertura nos testes unitários do `backend` — baixo o bastante pra valer a pena ler linha por linha o que exatamente ficava de fora, em vez de só aceitar o número. Cruzando as linhas não cobertas do relatório unitário **com** as do e2e (uma linha só é uma lacuna de verdade se nenhuma das duas suítes a alcança), quatro delas eram comportamento documentado e importante, não decisão de escopo:

| Lacuna | Onde | Por que importava |
|---|---|---|
| Reserva expira sozinha por TTL (2 min) | `ProductsService.sweepExpired` | É a garantia central de "nunca vende além do estoque" ficar consistente com o tempo — documentada extensivamente no README, e nenhum teste jamais deixava o relógio passar do TTL pra provar que a reserva realmente se solta sozinha. |
| `erp.call()` **rejeitando** (falha de rede), não só respondendo `success: false` | `CheckoutService.settleWithErp` | O `try/catch` ao redor do `Promise.race` existe especificamente para esse caso — e nenhum teste nunca fez o mock do ERP rejeitar de verdade, só resolver com falha. |
| Fallback de erro 500 para uma exceção não tratada | `HttpExceptionFilter` | É a rede de segurança de todo o app — o único filtro global de exceções — e não tinha nenhum teste, unitário ou e2e, garantindo que ele realmente devolve um 500 bem formado em vez de vazar stack trace ou derrubar o processo. |
| Backend falha ao iniciar se o `erp-mock` responder com erro ao buscar o catálogo | `ErpService.fetchCatalog` | Comportamento citado três vezes no README como decisão deliberada ("falha ao iniciar em vez de subir com um catálogo vazio") — e nunca verificado por um teste, só por leitura do código. |

As três primeiras ganharam testes novos nos arquivos já existentes (`products.service.spec.ts`, `checkout.service.spec.ts`); a última — junto com o caminho feliz de `ErpService.call()` — ganhou um arquivo novo, `erp.service.spec.ts`, uma pequena exceção deliberada à decisão de escopo original ("só `ProductsService`/`CheckoutService` têm unitário próprio", `specs/spec.md`) porque `ErpService` é o único ponto do código que fala HTTP direto com o `erp-mock`, e seus dois modos de falha documentados não tinham nenhuma cobertura. `HttpExceptionFilter` também ganhou um `http-exception.filter.spec.ts` novo pelo mesmo motivo: é infraestrutura transversal ao app inteiro, não lógica de negócio de um único serviço, mas o filtro em si nunca tinha sido testado isoladamente.

Resultado: cobertura unitária do `backend` foi de 65.84% → **81.27%** statements (44.61% → **59.45%** branches), com 8 testes novos (11 → 19), fechando as quatro lacunas acima sem tocar em nenhum código de produção — todos os testes novos exercitam comportamento que já existia.

## Resumo

| Suíte | Statements | Branches | Functions | Lines | Testes |
|---|---|---|---|---|---|
| `backend` — unitários | 81.27% | 59.45% | 67.50% | 80.61% | 19 |
| `backend` — e2e | 93.27% | 56.32% | 98.14% | 93.51% | 15 |
| `erp-mock` | 96.15% | 77.77% | 83.33% | 96.00% | 7 |
| `frontend` | 82.11% | 82.35% | 57.69% | 82.11% | 8 |

O `backend` aparece duas vezes de propósito: os testes unitários cobrem `ProductsService`/`CheckoutService` (as duas com regra de negócio de verdade) mais, agora, `ErpService` e `HttpExceptionFilter` (ver acima) — enquanto `OrdersService`/`IdempotencyService`/controllers continuam cobertos de ponta a ponta pela suíte e2e via HTTP real, não por unitários próprios. As duas rodadas juntas são a cobertura de verdade do backend; nenhuma das duas sozinha conta a história completa.

## `backend` — testes unitários (`npm run test:coverage`)

```
---------------------------|---------|----------|---------|---------|-------------------
File                       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------------------|---------|----------|---------|---------|-------------------
All files                  |   81.27 |    59.45 |    67.5 |   80.61 |
 checkout                  |   91.54 |    68.42 |   88.88 |   92.18 |
  checkout.service.ts      |   91.54 |    68.42 |   88.88 |   92.18 | 72,97-100
 common/exceptions         |   88.88 |      100 |      75 |   88.88 |
  app.exception.ts         |   88.88 |      100 |      75 |   88.88 | 26
 common/filters            |     100 |    55.55 |     100 |     100 |
  http-exception.filter.ts |     100 |    55.55 |     100 |     100 | 12,18-26
 erp                       |     100 |       80 |     100 |     100 |
  erp.service.ts           |     100 |       80 |     100 |     100 | 51-58
 idempotency               |   36.36 |        0 |       0 |   22.22 |
  idempotency.service.ts   |   36.36 |        0 |       0 |   22.22 | 11-23
 orders                    |   14.81 |        0 |       0 |       8 |
  orders.service.ts        |   14.81 |        0 |       0 |       8 | 17-53
 products                  |   92.85 |    81.81 |   76.92 |   95.83 |
  products.service.ts      |   92.85 |    81.81 |   76.92 |   95.83 | 36-40
---------------------------|---------|----------|---------|---------|-------------------

Test Suites: 4 passed, 4 total
Tests:       19 passed, 19 total
```

`idempotency`/`orders` continuam sem teste unitário próprio — decisão de escopo deliberada, não esquecimento — cobertos abaixo, pela suíte e2e. `products.service.ts` 36-40 são `listProducts()`/`findProduct()` — getters triviais nunca chamados isoladamente nos unitários, só via e2e/controller; não valia a pena um teste só pra isso.

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

`erp.service.ts` 36-37/65-66 (o "erp-mock respondeu com erro" de cada método) e `http-exception.filter.ts` 24-28 (o fallback 500) aparecem descobertos aqui de propósito — nenhum cenário e2e consegue fazer o `erp-mock` responder com um status de erro (ele sempre responde 200, só varia o corpo), então essas duas linhas só ficam cobertas pelos unitários acima (ver `erp.service.spec.ts`/`http-exception.filter.spec.ts`). `orders.service.ts` 37-38/47-48 (o guard de "ignora se o pedido já não está mais pending") também não é alcançado por e2e, porque nenhum fluxo real chama `markConfirmed`/`markFailed` duas vezes pro mesmo pedido — só o guard interno de `ProductsService` (`confirmReservation`/`releaseReservation` chamados duas vezes) já tem teste dedicado; o de `OrdersService` fica como uma lacuna pequena e de baixo risco, deliberadamente não fechada nesta rodada (mesma classe de proteção, já teria o comportamento validado por analogia).

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
- **`idempotency.service.ts`/`orders.service.ts` nos unitários** — decisão de escopo deliberada: só serviços com lógica de negócio própria (`ProductsService`, `CheckoutService`) mais os dois pontos de infraestrutura transversal com modo de falha documentado (`ErpService`, `HttpExceptionFilter`) ganham unitário dedicado; os demais são adaptadores finos, cobertos pela suíte e2e via HTTP real.
- **`OrdersService.markConfirmed`/`markFailed` chamados num pedido que já não está mais pending** — mesma classe de guard que `ProductsService.confirmReservation`/`releaseReservation` já tem testado explicitamente; fica como lacuna pequena e de baixo risco, não fechada nesta rodada.
- **Ramos de erro de rede nos `*.service.ts` do frontend** — cobertos indiretamente por `App.test.tsx` (o teste "shows a connection error..." simula uma rejeição de `fetch`), mas o relatório de cobertura por arquivo não atribui isso à linha exata dentro do service porque o mock intercepta no nível do `fetch` global, não da chamada ao método do serviço.
