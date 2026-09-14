# Evidências de validação — branch `redis`

Captura real de terminal validando a branch `redis` (Fase 1: reserva de estoque, idempotência e pedidos no Redis via script Lua) — mesma metodologia de [`logs-backend.md`](logs-backend.md), agora cobrindo também os dois comportamentos que só esta branch tem: sobreviver a um restart do processo e a expiração nativa de uma reserva por TTL do Redis, sem cron nem sweep da aplicação. Nada mockado no nível de log — mesmas classes, mesmo `Logger`, mesmo `erp-mock`, mesmo Redis real (`docker compose up -d redis`, AOF habilitado). Ver ["Armazenamento: Redis, não mais em memória"](../README.md#armazenamento-redis-não-mais-em-memória) no README desta branch para o esquema de chaves e os scripts Lua.

A captura tem duas execuções do backend (script em `evidencias/`, não versionado): a **RUN 1** sobe com `ERP_SIM_MODE=always-success` e cobre os cenários 1–7; a **RUN 2** reinicia com `ERP_SIM_MODE=always-fail` especificamente para o cenário 8. O log bruto (sem edição, com os dois boots completos) está em [`logs-redis.txt`](logs-redis.txt).

## Resultado da execução (2026-09-14)

| Cenário | Resultado |
|---|---|
| Caminho feliz | `202 pending` → `confirmed` |
| Estoque insuficiente | `409 OUT_OF_STOCK`, nada reservado |
| Concorrência (2 requisições, última unidade) | uma `202`, uma `409` — decidido dentro do script Lua |
| Idempotência (mesma chave 2x) | mesmo `orderId` nas duas respostas, um só pedido criado |
| Restart do processo (`kill -9` + religa) | pedido e estoque idênticos a antes do restart |
| TTL nativo de uma reserva (demo isolada, 3s) | chave some sozinha, sem nenhum código da aplicação envolvido |
| Falha do ERP (`always-fail`, 3 tentativas) | `failed` / `ERP_PROCESSING_FAILED`, estoque liberado de volta |

## Índice

1. [Caminho feliz](#1-caminho-feliz)
2. [Estoque insuficiente](#2-estoque-insuficiente)
3. [Concorrência: duas requisições pela última unidade](#3-concorrência-duas-requisições-pela-última-unidade)
4. [Idempotência: reenvio da mesma chave](#4-idempotência-reenvio-da-mesma-chave)
5. [Inspeção das chaves no Redis](#5-inspeção-das-chaves-no-redis)
6. [Restart do processo: pedido e estoque sobrevivem](#6-restart-do-processo-pedido-e-estoque-sobrevivem)
7. [TTL nativo liberando uma reserva sozinho](#7-ttl-nativo-liberando-uma-reserva-sozinho)
8. [ERP esgota as 3 tentativas → pedido `failed`, estoque liberado](#8-erp-esgota-as-3-tentativas--pedido-failed-estoque-liberado)

---

## 1. Caminho feliz

```
[HTTP] --> POST /checkout requestId=71fec5f2 ip=::1
[CheckoutService] Checkout recebido — requestId=71fec5f2 productId=capinha-preta quantity=1 idempotencyKey=cap1-happy
[IdempotencyService] Consulta de idempotência — idempotencyKey=cap1-happy result=miss
[OrdersService] Pedido criado — orderId=ord_000001 productId=capinha-preta quantity=1 status=pending
[ProductsService] Estoque reservado — orderId=ord_000001 productId=capinha-preta quantity=1 remainingAvailable=4 ttlSeconds=120
[IdempotencyService] Resposta de sucesso armazenada — idempotencyKey=cap1-happy orderId=ord_000001 ttlSeconds=86400
[HTTP] <-- POST /checkout requestId=71fec5f2 status=202 durationMs=4.0
[CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=1/3 timeoutMs=3000
[ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-success simDelayMs=150
[ErpService] erp-mock respondeu — httpStatus=200 success=true durationMs=160
[ProductsService] Reserva confirmada, estoque debitado — orderId=ord_000001
[OrdersService] Pedido confirmado — orderId=ord_000001 status=confirmed
[CheckoutService] ERP confirmou o pedido — orderId=ord_000001 attempt=1/3
```

`ttlSeconds=86400` na idempotência (24h, ADR-003) e `ttlSeconds=120` na reserva (2min, ADR-002) só existem porque a chave agora vive no Redis — a versão em memória de `main` não tinha TTL em nenhum dos dois.

## 2. Estoque insuficiente

```
curl POST /checkout (quantity=5, stock=1) -> {"error":{"code":"OUT_OF_STOCK","message":"Este produto está esgotado no momento."}}
HTTP 409
```

```
[ProductsService] Reserva recusada: estoque insuficiente — orderId=ord_000002 productId=capinha-listrada requested=5 available=1
[OrdersService] Pedido marcado como failed — orderId=ord_000002 status=failed errorCode=OUT_OF_STOCK ...
[HttpExceptionFilter] Requisição rejeitada — status=409 errorCode=OUT_OF_STOCK ...
```

## 3. Concorrência: duas requisições pela última unidade

Duas chamadas disparadas em paralelo (`&` + `wait`) contra `capinha-listrada`, que tinha 1 unidade:

```
requisicao A -> {"orderId":"ord_000003","status":"pending","statusUrl":"/orders/ord_000003"}
HTTP 202
requisicao B -> {"error":{"code":"OUT_OF_STOCK","message":"Este produto está esgotado no momento."}}
HTTP 409
```

A decisão de qual das duas ganha não acontece mais no event loop do Node (não há mais um único processo síncrono) — acontece dentro do script `reserve-stock.lua`, que o Redis garante rodar do início ao fim sem intercalar com nenhum outro comando. O `ProductsService.spec.ts` desta branch tem um teste de regressão específico para isso, rodando contra Redis real (`lets only one of two concurrent reservations for the last unit succeed`).

## 4. Idempotência: reenvio da mesma chave

```
1a chamada -> {"orderId":"ord_000005","status":"pending","statusUrl":"/orders/ord_000005"}
2a chamada (mesma key) -> {"orderId":"ord_000005","status":"pending","statusUrl":"/orders/ord_000005"}
```

```
[IdempotencyService] Consulta de idempotência — idempotencyKey=idem-demo result=miss
[OrdersService] Pedido criado — orderId=ord_000005 ...
[IdempotencyService] Resposta de sucesso armazenada — idempotencyKey=idem-demo orderId=ord_000005 ttlSeconds=86400
...
[IdempotencyService] Consulta de idempotência — idempotencyKey=idem-demo result=hit
[CheckoutService] Checkout idempotente: resposta anterior reaproveitada, nada foi reprocessado — orderId=ord_000005 ...
```

Um único pedido criado (`ord_000005`) apesar de duas chamadas — a segunda nem chega a olhar o catálogo ou tentar reservar nada.

## 5. Inspeção das chaves no Redis

Direto no `redis-cli`, sem passar pela API, para confirmar que o estado é mesmo o que o esquema de chaves do README descreve:

```
redis-cli KEYS order:*
order:ord_000003
order:ord_000005
order:seq
order:ord_000004
order:ord_000001
order:ord_000002

redis-cli MGET product:stock:capinha-preta product:stock:capinha-transparente product:stock:capinha-listrada
4
9
0
```

`capinha-preta` em 4 (era 5, uma venda confirmada no cenário 1), `capinha-transparente` em 9 (era 10, uma venda confirmada no cenário 4), `capinha-listrada` em 0 (era 1, vendida no cenário 3) — o estoque *base* já reflete os débitos permanentes, não só a disponibilidade calculada na hora da leitura.

## 6. Restart do processo: pedido e estoque sobrevivem

```
matando o processo do backend (kill -9) e religando com o mesmo ERP_SIM_MODE...
curl GET /orders/ord_000001 depois do restart -> {"orderId":"ord_000001","status":"confirmed"}
curl GET /products depois do restart -> {"products":[
  {"id":"capinha-preta","stock":4,...},
  {"id":"capinha-transparente","stock":9,...},
  {"id":"capinha-listrada","stock":0,...}
]}
```

O processo do backend morreu de verdade (`kill -9`, não um shutdown gracioso) e foi religado do zero. `ord_000001` continua `confirmed` e o estoque continua exatamente 4/9/0 — nada disso sobreviveria em `main`, onde um `kill -9` apaga os três `Map`s em memória. É a garantia central que esta branch existe para demonstrar.

## 7. TTL nativo liberando uma reserva sozinho

Demo isolada e direta no Redis (fora do fluxo de checkout, só para tornar visível o mecanismo que `reserve-stock.lua` usa por baixo — a reserva real tem TTL de 120s, longo demais para caber numa captura):

```
redis-cli SET reservation:demo-ttl "capinha-preta:1" EX 3
OK
TTL reservation:demo-ttl logo apos criar -> 3
EXISTS reservation:demo-ttl apos 4s (TTL era 3s) -> 0
```

Nenhum código da aplicação rodou entre as duas linhas — o próprio Redis apagou a chave quando o TTL zerou. É esse o mecanismo que substitui o `sweepExpired()` do `main` (um laço que a aplicação precisava rodar a cada leitura para achar reservas vencidas): aqui, a chave simplesmente deixa de existir, e a próxima chamada a `reserveStock` já não a encontra na hash de reservas ativas.

## 8. ERP esgota as 3 tentativas → pedido `failed`, estoque liberado

Backend religado com `ERP_SIM_MODE=always-fail` (RUN 2) especificamente para este cenário:

```
[CheckoutService] Chamando o ERP — orderId=ord_000006 attempt=1/3 timeoutMs=3000
[ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=155
[CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000006 attempt=1/3
[CheckoutService] Aguardando antes da próxima tentativa — orderId=ord_000006 backoffMs=1000
[CheckoutService] Chamando o ERP — orderId=ord_000006 attempt=2/3 timeoutMs=3000
[ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=153
[CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000006 attempt=2/3
[CheckoutService] Aguardando antes da próxima tentativa — orderId=ord_000006 backoffMs=2000
[CheckoutService] Chamando o ERP — orderId=ord_000006 attempt=3/3 timeoutMs=3000
[ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=153
[CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000006 attempt=3/3
[ProductsService] Reserva liberada, estoque volta a ficar disponível — orderId=ord_000006
[OrdersService] Pedido marcado como failed — orderId=ord_000006 status=failed errorCode=ERP_PROCESSING_FAILED ...
[CheckoutService] Pedido falhou definitivamente após esgotar as tentativas; estoque liberado — orderId=ord_000006 attempts=3
```

```
curl GET /orders/ord_000006 -> {"orderId":"ord_000006","status":"failed","error":{"code":"ERP_PROCESSING_FAILED", ...}}
estoque de capinha-transparente apos falha -> stock=9  (mesmo valor de antes desta tentativa — a reserva liberada devolveu a unidade)
```

`releaseReservation` roda no mesmo script Lua que `reserveStock`, então liberar a reserva de `ord_000006` some da hash `product:reservations:capinha-transparente` de forma atômica — nenhuma outra requisição concorrente consegue ver um estado intermediário onde a reserva já não conta mas a chave ainda existe.
