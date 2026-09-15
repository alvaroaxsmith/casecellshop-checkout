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

Numa terceira rodada, a decisão de escopo original ("só `ProductsService`/`CheckoutService` têm unitário próprio, o resto é e2e-only") foi revisitada porque valia a pena testar diretamente, e não só via HTTP, um conjunto de branches pequenas e baratas de cobrir:

| Lacuna | Onde | O que fechou |
|---|---|---|
| `OrdersService` inteiro (14.81%) sem nenhum unitário próprio | `orders/orders.service.ts` | Arquivo novo `orders.service.spec.ts` — `createOrder`/`getOrder`/`markConfirmed`/`markFailed`, incluindo os guards contra chamar `markConfirmed`/`markFailed` duas vezes para o mesmo pedido (mesma classe de proteção que já tem um bug real registrado em `ProductsService`, ver `PROMPTS.md`). |
| `IdempotencyService` inteiro (36.36%) sem nenhum unitário próprio | `idempotency/idempotency.service.ts` | Arquivo novo `idempotency.service.spec.ts` — hit/miss de `getStoredResponse`, `storeResponse`, e que chaves diferentes não vazam uma resposta pra outra. |
| `OrderNotFoundException` nunca instanciada num teste unitário | `common/exceptions/app.exception.ts` | Arquivo novo `app.exception.spec.ts` testando o status HTTP e o corpo exato das 4 exceções de domínio de uma vez, em vez de depender de cada uma aparecer incidentalmente em outro teste. |
| Sucesso do ERP na 1ª tentativa (linhas 97-100) e o `.catch()` de segurança em volta de `settleWithErp` (linha 72) nunca exercitados | `checkout/checkout.service.ts` | Dois testes novos em `checkout.service.spec.ts`: um com `erp.call()` resolvendo sucesso de cara; outro forçando `products.confirmReservation` a lançar de propósito, provando que o `.catch()` — que existe especificamente pra isso — realmente impede um bug ali de virar unhandled rejection. |
| Branches de fallback (`?? "-"`, `instanceof Error ? ... : String(...)`) nunca exercitadas | `common/filters/http-exception.filter.ts` | Três testes novos: requisição sem `requestId`, uma `HttpException` sem `error.code`/`error.message` no corpo, e um valor não-`Error` lançado. |
| Header `X-Erp-Simulate-Delay-Ms` nunca exercitado | `erp/erp.service.ts` | Um teste novo setando `ERP_SIM_DELAY_MS` e conferindo o header saindo na chamada `fetch`. |

Resultado: cobertura unitária do `backend` foi de 81.27% → **97.71%** statements (59.45% → **89.18%** branches, 67.50% → **92.50%** functions), com 20 testes novos (19 → 39) — `orders`, `idempotency`, `erp` e `common/filters` foram todos a 100% em todas as quatro métricas.

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
| `backend` — unitários | 97.71% | 89.18% | 92.50% | 98.97% | 39 |
| `backend` — e2e | 94.35% | 58.62% | 98.14% | 94.75% | 17 |
| `erp-mock` | 96.96% | 76.92% | 83.33% | 96.87% | 9 |
| `frontend` | 95.69% | 90.76% | 80.76% | 95.69% | 15 |

O `backend` aparece duas vezes de propósito: os testes unitários agora cobrem todos os `Service`s do app diretamente (`ProductsService`/`CheckoutService` com a regra de negócio, mais `OrdersService`/`IdempotencyService`/`ErpService`/`HttpExceptionFilter`) — enquanto os `Controller`s/`Module`s continuam cobertos de ponta a ponta só pela suíte e2e via HTTP real, sem unitário próprio (não têm lógica alguma além de roteamento). As duas rodadas juntas são a cobertura de verdade do backend; nenhuma das duas sozinha conta a história completa.

## `backend` — testes unitários (`npm run test:coverage`)

```
---------------------------|---------|----------|---------|---------|-------------------
File                       | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
---------------------------|---------|----------|---------|---------|-------------------
All files                  |   97.71 |    89.18 |    92.5 |   98.97 |
 checkout                  |   98.59 |    78.94 |     100 |     100 |
  checkout.service.ts      |   98.59 |    78.94 |     100 |     100 | 74-92,106
 common/exceptions         |     100 |      100 |     100 |     100 |
  app.exception.ts         |     100 |      100 |     100 |     100 |
 common/filters            |     100 |      100 |     100 |     100 |
  http-exception.filter.ts |     100 |      100 |     100 |     100 |
 erp                       |     100 |      100 |     100 |     100 |
  erp.service.ts           |     100 |      100 |     100 |     100 |
 idempotency               |     100 |      100 |     100 |     100 |
  idempotency.service.ts   |     100 |      100 |     100 |     100 |
 orders                    |     100 |      100 |     100 |     100 |
  orders.service.ts        |     100 |      100 |     100 |     100 |
 products                  |   92.85 |    81.81 |   76.92 |   95.83 |
  products.service.ts      |   92.85 |    81.81 |   76.92 |   95.83 | 36-40
---------------------------|---------|----------|---------|---------|-------------------

Test Suites: 7 passed, 7 total
Tests:       39 passed, 39 total
```

`products.service.ts` 36-40 são `listProducts()`/`findProduct()` — getters triviais nunca chamados isoladamente nos unitários, só via e2e/controller; não valia a pena um teste só pra isso. `checkout.service.ts`'s poucos pontos de branch restantes (78.94%) são o fallback `BACKOFF_MS[attempt - 1] ?? 1000` (o array sempre tem entradas suficientes para as 3 tentativas documentadas, então esse `?? 1000` nunca é atingido de verdade) e o lado `instanceof Error ? err.stack : String(err)` que só dispara para uma rejeição não-`Error` — mesma classe de branch defensiva, baixo valor de perseguir mais.

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

`erp.service.ts` 36-37 (o `throw` de `fetchCatalog` quando o `erp-mock` não responde no boot) e `http-exception.filter.ts` 24-28 (o fallback 500) continuam descobertos aqui de propósito — nenhum cenário e2e consegue fazer o backend falhar o boot ou lançar uma exceção não tratada sem quebrar a própria suíte; essas duas linhas só ficam cobertas pelos unitários (`erp.service.spec.ts`/`http-exception.filter.spec.ts`, ambos a 100% na rodada unitária, ver acima). As demais linhas descobertas em `orders.service.ts`/`products.service.ts` são guards contra chamar `confirmReservation`/`releaseReservation`/`markConfirmed`/`markFailed` duas vezes para o mesmo pedido — nenhum fluxo real do app faz essa segunda chamada (`CheckoutService` só chama cada um deles uma vez por tentativa), então só são alcançáveis chamando o método diretamente; ambos os pares agora têm teste unitário dedicado cobrindo exatamente isso (`products.service.spec.ts`, `orders.service.spec.ts` — o de `ProductsService` existe porque um bug real de débito duplo já aconteceu ali, ver `PROMPTS.md`).

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
- **`Controller`s/`Module`s do backend nos unitários** — decisão de escopo deliberada: eles não têm lógica além de roteamento (todo mapeamento erro→HTTP é centralizado no `HttpExceptionFilter`, que já tem unitário próprio), então são cobertos pela suíte e2e via HTTP real em vez de ganharem um dublê de teste que só reimplementaria a mesma chamada.
- **`checkout.service.ts`'s `BACKOFF_MS[attempt - 1] ?? 1000` e o lado não-`Error` de `instanceof Error ? err.stack : String(err)`** — branches defensivas que não têm como acontecer com os valores hardcoded atuais (`BACKOFF_MS` sempre tem entradas para as 3 tentativas documentadas); baixo valor de perseguir mais.
- **`erp-mock`'s delay aleatório sem override** (`randomBetween`) — todos os testes fixam o delay via header pra ficarem rápidos; o cálculo de um delay aleatório de verdade só roda fora da suíte, em uso normal sem overrides.
- **`useCheckout.ts`'s branch de polling esgotado (15 tentativas)** e **a classe CSS de estoque baixo em `ProductCard.tsx`** — ver a seção `frontend` acima.
