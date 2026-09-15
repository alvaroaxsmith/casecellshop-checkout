# Relatório de cobertura de testes

Números reais, gerados rodando `npm run test:coverage` (Jest `--coverage` no `backend`/`erp-mock`, Vitest `--coverage` no `frontend`) e `npm run test:e2e:coverage` no `backend` — nenhum número aqui foi estimado ou inventado. O texto bruto de cada ferramenta está reproduzido abaixo de cada tabela, sem edição.

## Pontas soltas encontradas e fechadas — backend

A primeira versão deste relatório tinha 65.84% de cobertura nos testes unitários do `backend` — baixo o bastante pra valer a pena ler linha por linha o que exatamente ficava de fora, em vez de só aceitar o número. Cruzando as linhas não cobertas do relatório unitário **com** as do e2e (uma linha só é uma lacuna de verdade se nenhuma das duas suítes a alcança), quatro delas eram comportamento documentado e importante, não decisão de escopo:

| Lacuna | Onde | Por que importava |
|---|---|---|
| Reserva expira sozinha por TTL (2 min) | `ProductsService.sweepExpired` | É a garantia central de "nunca vende além do estoque" ficar consistente com o tempo — documentada extensivamente no README, e nenhum teste jamais deixava o relógio passar do TTL pra provar que a reserva realmente se solta sozinha. |
| `erp.call()` **rejeitando** (falha de rede), não só respondendo `success: false` | `CheckoutService.settleWithErp` | O `try/catch` ao redor do `Promise.race` existe especificamente para esse caso — e nenhum teste nunca fez o mock do ERP rejeitar de verdade, só resolver com falha. |
| Fallback de erro 500 para uma exceção não tratada | `HttpExceptionFilter` | É a rede de segurança de todo o app — o único filtro global de exceções — e não tinha nenhum teste, unitário ou e2e, garantindo que ele realmente devolve um 500 bem formado em vez de vazar stack trace ou derrubar o processo. |
| Backend falha ao iniciar se o `erp-mock` responder com erro ao buscar o catálogo | `ErpService.fetchCatalog` | Comportamento citado três vezes no README como decisão deliberada ("falha ao iniciar em vez de subir com um catálogo vazio") — e nunca verificado por um teste, só por leitura do código. |

As três primeiras ganharam testes novos nos arquivos já existentes (`products.service.spec.ts`, `checkout.service.spec.ts`); a última — junto com o caminho feliz de `ErpService.call()` — ganhou um arquivo novo, `erp.service.spec.ts`. `HttpExceptionFilter` também ganhou um `http-exception.filter.spec.ts` novo. Resultado: cobertura unitária do `backend` foi de 65.84% → **81.27%** statements, com 8 testes novos (11 → 19).

Depois, os modos `always-http-error`/`always-reset` do `erp-mock` (ver seção 4 de ["Demonstrando a simulação de lentidão/instabilidade do ERP"](../README.md#4-dois-modos-de-instabilidade-adicionais--always-http-error-e-always-reset) no README) ganharam dois testes e2e novos em `checkout.e2e-spec.ts`, subindo a suíte e2e de 15 para 17 testes e fechando, contra o `erp-mock` real, o `if (!res.ok)` de `ErpService.call` que antes só era exercitado com `fetch` mockado (`erp.service.ts` foi de 85.71% para **92.85%** statements na cobertura e2e).

## Pontas soltas encontradas e fechadas — frontend

Investigando por que `*.service.ts`, `product-images.ts` e parte de `ProductCard.tsx`/`useCheckout.ts` apareciam com cobertura baixa (9–29%) — baixo o bastante pra também valer a pena ler linha por linha em vez de aceitar o número — três causas reais apareceram, nenhuma delas "decisão de escopo":

| Lacuna | Onde | Por que era real |
|---|---|---|
| `postCheckout`/`fetchOrderStatus`/`fetchProducts` nunca executavam de verdade | `checkout.service.ts`, `orders.service.ts`, `products.service.ts` | `test/App.test.tsx` usa `vi.mock("../src/services/...")`, que substitui o **módulo inteiro** por um mock automático — a montagem de URL, o método/headers/body e o parse do JSON de resposta desses três arquivos nunca rodavam em nenhum teste. O relatório anterior afirmava que esse código "rodava de verdade" nas chamadas de `App.test.tsx`; essa afirmação estava errada. |
| Foto do produto (`<img>`, `productImageUrl`/`productImageSrcSet`) nunca renderizava | `ProductCard.tsx`, `utils/product-images.ts` | Todo fixture de produto nos testes usava `imageUrl: ""`, então o card sempre caía no branch "Sem foto" — as duas funções que montam a URL responsiva nunca executavam. |
| `useCheckout`'s loop de polling nunca de fato iterava mais de uma vez | `hooks/useCheckout.ts` (`sleep()`, linha do `await sleep(...)`) | Todo teste fazia `fetchOrderStatus` responder `confirmed`/`failed` já na primeira chamada — o caminho "ainda `pending`, espera 1s, tenta de novo" nunca era exercitado. |

Fechadas com testes novos, sem tocar em nenhum código de produção: um arquivo novo `test/services.test.ts` (3 testes, mockando `global.fetch` diretamente para exercitar os três serviços de verdade — o mesmo padrão que `erp.service.spec.ts` já usa no backend), um fixture de produto com `imageUrl` real em `test/App.test.tsx` mais uma asserção conferindo o `src`/`srcset` gerados, e um teste de polling que responde `pending` na primeira chamada e `confirmed` na segunda. Também apareceu, e foi corrigida, uma causa raiz separada: `test/App.test.tsx` não tinha nenhum `beforeEach(() => vi.resetAllMocks())`, então implementações de mock de um teste vazavam para o próximo (descoberto quando o teste de polling contava 3 chamadas em vez de 2 só quando rodado junto com o resto do arquivo, nunca sozinho).

Resultado: cobertura do `frontend` foi de 82.11% → **95.69%** statements (82.35% → **90.76%** branches), com 7 testes novos: 4 em `test/App.test.tsx` (8 → 12) e um arquivo novo, `test/services.test.ts` (3 testes) — 8 → 15 testes no total do pacote.

## Resumo

| Suíte | Statements | Branches | Functions | Lines | Testes |
|---|---|---|---|---|---|
| `backend` — unitários | 81.27% | 59.45% | 67.50% | 80.61% | 19 |
| `backend` — e2e | 94.35% | 58.62% | 98.14% | 94.75% | 17 |
| `erp-mock` | 96.96% | 76.92% | 83.33% | 96.87% | 9 |
| `frontend` | 95.69% | 90.76% | 80.76% | 95.69% | 15 |

O `backend` aparece duas vezes de propósito: os testes unitários cobrem `ProductsService`/`CheckoutService` (as duas com regra de negócio de verdade) mais `ErpService` e `HttpExceptionFilter` — enquanto `OrdersService`/`IdempotencyService`/controllers continuam cobertos de ponta a ponta pela suíte e2e via HTTP real, não por unitários próprios. As duas rodadas juntas são a cobertura de verdade do backend; nenhuma das duas sozinha conta a história completa.

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
All files                      |   94.35 |    58.62 |   98.14 |   94.75 |
 src                           |   95.83 |       40 |     100 |     100 |
  app.module.ts                |     100 |      100 |     100 |     100 |
  bootstrap.ts                 |   93.33 |       40 |     100 |     100 | 12-13
 src/checkout                  |   98.03 |    68.42 |    90.9 |    98.9 |
  checkout.controller.ts       |     100 |      100 |     100 |     100 |
  checkout.dto.ts               |     100 |      100 |     100 |     100 |
  checkout.module.ts            |     100 |      100 |     100 |     100 |
  checkout.service.ts           |   97.18 |    68.42 |   88.88 |   98.43 | 72
 src/common/dto                 |     100 |      100 |     100 |     100 |
  error-response.dto.ts         |     100 |      100 |     100 |     100 |
 src/common/exceptions           |     100 |      100 |     100 |     100 |
  app.exception.ts               |     100 |      100 |     100 |     100 |
 src/common/filters              |   88.23 |    44.44 |     100 |   86.66 |
  http-exception.filter.ts       |   88.23 |    44.44 |     100 |   86.66 | 24-28
 src/common/middleware           |      95 |    83.33 |     100 |     100 |
  request-logger.middleware.ts   |      95 |    83.33 |     100 |     100 | 28
 src/erp                         |   93.93 |       50 |     100 |    93.1 |
  erp.module.ts                  |     100 |      100 |     100 |     100 |
  erp.service.ts                 |   92.85 |       50 |     100 |    92.3 | 36-37
 src/idempotency                 |     100 |      100 |     100 |     100 |
  idempotency.module.ts          |     100 |      100 |     100 |     100 |
  idempotency.service.ts         |     100 |      100 |     100 |     100 |
 src/orders                      |   92.85 |       50 |     100 |   91.83 |
  order.dto.ts                   |     100 |      100 |     100 |     100 |
  orders.controller.ts           |     100 |      100 |     100 |     100 |
  orders.module.ts               |     100 |      100 |     100 |     100 |
  orders.service.ts              |   85.18 |       40 |     100 |      84 | 37-38,47-48
 src/products                    |   89.77 |    54.54 |     100 |   89.33 |
  product.dto.ts                 |     100 |      100 |     100 |     100 |
  products.controller.ts         |     100 |      100 |     100 |     100 |
  products.module.ts             |     100 |      100 |     100 |     100 |
  products.service.ts            |   83.92 |    54.54 |     100 |   83.33 | 54-55,81-84,99-102,125-126
-------------------------------|---------|----------|---------|---------|----------------------------

Test Suites: 3 passed, 3 total
Tests:       17 passed, 17 total
```

`erp.service.ts` 36-37 (o `throw` de `fetchCatalog` quando o `erp-mock` não responde no boot) e `http-exception.filter.ts` 24-28 (o fallback 500) continuam descobertos aqui de propósito — nenhum cenário e2e consegue fazer o backend falhar o boot ou lançar uma exceção não tratada sem quebrar a própria suíte; essas duas linhas só ficam cobertas pelos unitários (`erp.service.spec.ts`/`http-exception.filter.spec.ts`). As demais linhas descobertas em `orders.service.ts`/`products.service.ts` são guards contra chamar `confirmReservation`/`releaseReservation`/`markConfirmed`/`markFailed` duas vezes para o mesmo pedido — nenhum fluxo real do app faz essa segunda chamada (`CheckoutService` só chama cada um deles uma vez por tentativa), então só são alcançáveis chamando o método diretamente, o que `products.service.spec.ts` já faz para o par `confirmReservation`/`releaseReservation` (histórico: um bug real de débito duplo já existiu aí, ver `PROMPTS.md`); o par equivalente em `OrdersService` fica sem teste dedicado, mesma decisão de escopo do resto do arquivo.

## `erp-mock` (`npm run test:coverage`)

```
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   96.96 |    76.92 |   83.33 |   96.87 |
 app.ts   |   96.96 |    76.92 |   83.33 |   96.87 | 91
----------|---------|----------|---------|---------|-------------------

Test Suites: 1 passed, 1 total
Tests:       9 passed, 9 total
```

Linha 91 é `randomBetween()`, usada apenas para o delay aleatório do modo `random` sem nenhum header de override — todos os 9 testes mandam `X-Erp-Simulate-Delay-Ms` explicitamente para ficarem rápidos e determinísticos, então esse caminho nunca é exercitado. Comportamento real em uso normal (sem overrides), só não coberto por escolha deliberada de manter a suíte rápida.

## `frontend` (`npm run test:coverage`)

```
-------------------|---------|----------|---------|---------|-------------------
File               | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
-------------------|---------|----------|---------|---------|-------------------
All files          |   95.69 |    90.76 |   80.76 |   95.69 |
 src               |   30.76 |       50 |      50 |   30.76 |
  App.tsx          |     100 |      100 |     100 |     100 |
  main.tsx         |       0 |        0 |       0 |       0 | 1-10
 src/controller     |     100 |      100 |     100 |     100 |
  CheckoutController.tsx |     100 |      100 |     100 |     100 |
 src/hooks          |   94.73 |       92 |     100 |   94.73 |
  useCheckout.ts    |   93.54 |     90.9 |     100 |   93.54 | 76-79
  useProducts.ts    |     100 |      100 |     100 |     100 |
 src/services        |     100 |      100 |     100 |     100 |
  checkout.service.ts |     100 |      100 |     100 |     100 |
  http.ts             |     100 |      100 |     100 |     100 |
  orders.service.ts   |     100 |      100 |     100 |     100 |
  products.service.ts |     100 |      100 |     100 |     100 |
 src/utils           |     100 |      100 |     100 |     100 |
  classnames.ts      |     100 |      100 |     100 |     100 |
  format.ts          |     100 |      100 |     100 |     100 |
  product-images.ts  |     100 |      100 |     100 |     100 |
 src/view            |     100 |       88 |      60 |     100 |
  CheckoutPanel.tsx  |     100 |      100 |     100 |     100 |
  Header.tsx         |     100 |      100 |     100 |     100 |
  ProductCard.tsx    |     100 |       50 |      50 |     100 | 59-64
  ProductGrid.tsx    |     100 |      100 |     100 |     100 |
  QuantityStepper.tsx |     100 |      100 |      25 |     100 |
  StatusBanner.tsx   |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|-------------------

Test Files  2 passed (2)
     Tests  15 passed (15)
```

`*.service.ts`, `product-images.ts` e `ProductCard.tsx`/`useCheckout.ts`'s piores lacunas foram todas fechadas (ver seção acima). O que sobra, de propósito:

- **`main.tsx`** (0%) — bootstrap do React (`createRoot(...).render(...)`), equivalente ao `main.ts`/`bootstrap.ts` do backend. Testar isso exigiria montar um DOM real só para exercitar duas linhas de chamada de framework; a suíte `e2e/` (Playwright) já prova que a aplicação sobe e funciona de ponta a ponta.
- **`useCheckout.ts` 76-79** — a branch de "ainda `pending` depois de 15 tentativas de polling" (~15s no pior caso). Teria que usar temporizadores falsos (`vi.useFakeTimers`) ou esperar 15s de verdade; mesmo formato de código das duas branches terminais já testadas (`confirmed`/`failed`), risco baixo de estar errada — não fechada nesta rodada.
- **`ProductCard.tsx` 59-64** — a classe CSS do estado "estoque baixo" (1–2 unidades), puramente visual; os fixtures de teste usam 4/5 unidades. Sem risco de regressão funcional, só estético.

## O que fica de fora de propósito, e por quê

- **`main.ts`/`bootstrap.ts` (backend) e `main.tsx` (frontend)** — código de inicialização de processo (listen na porta, montagem do React no DOM). Testar isso exigiria subir um servidor/DOM real só para exercitar duas linhas de chamada de framework; a suíte `e2e/` (Playwright) já prova que o processo sobe e funciona de ponta a ponta.
- **`idempotency.service.ts`/`orders.service.ts` nos unitários** — decisão de escopo deliberada: só serviços com lógica de negócio própria (`ProductsService`, `CheckoutService`) mais os dois pontos de infraestrutura transversal com modo de falha documentado (`ErpService`, `HttpExceptionFilter`) ganham unitário dedicado; os demais são adaptadores finos, cobertos pela suíte e2e via HTTP real.
- **Guards contra chamar `confirmReservation`/`releaseReservation`/`markConfirmed`/`markFailed` duas vezes para o mesmo pedido** — nenhum fluxo real do app faz uma segunda chamada (`CheckoutService` chama cada um exatamente uma vez por tentativa); alcançáveis só chamando o método diretamente, o que já acontece em `products.service.spec.ts` para o par de `ProductsService` (havia um bug real de débito duplo aí antes, ver `PROMPTS.md`) — o par equivalente em `OrdersService` fica sem teste dedicado, mesma decisão de escopo do resto do arquivo.
- **`erp-mock`'s delay aleatório sem override** (`randomBetween`) — todos os testes fixam o delay via header pra ficarem rápidos; o cálculo de um delay aleatório de verdade só roda fora da suíte, em uso normal sem overrides.
- **`useCheckout.ts`'s branch de polling esgotado (15 tentativas)** e **a classe CSS de estoque baixo em `ProductCard.tsx`** — ver a seção `frontend` acima.
