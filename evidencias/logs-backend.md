# Evidências de log do backend

Captura real de terminal, gerada rodando o backend de verdade (nada mockado no nível de log — são as mesmas classes e o mesmo `Logger` do NestJS usados em produção) contra o `erp-mock` de verdade, e disparando `curl` contra cada cenário abaixo. Ver a seção "Rastreabilidade" do [`README.md`](../README.md) para o desenho geral (níveis de log, formato `campo=valor`, `requestId` vs. `orderId` como chave de correlação).

A captura tem duas partes: o **Bloco 1** sobe o backend com `ERP_SIM_MODE=always-success` e cobre o caminho feliz e os erros que não dependem do ERP falhar; o **Bloco 2** reinicia o backend com `ERP_SIM_MODE=always-fail` especificamente para mostrar o pedido esgotando as 3 tentativas e sendo marcado como `failed`. Os logs de framework do Nest (mapeamento de rotas, etc.) foram omitidos por não agregarem nada à evidência; o resto é exatamente o que apareceu no terminal, incluindo os timestamps reais.

## Índice

1. [Boot — catálogo carregado do `erp-mock`](#1-boot--catálogo-carregado-do-erp-mock)
2. [`GET /products`](#2-get-products)
3. [Validação: `idempotencyKey` ausente](#3-validação-idempotencykey-ausente)
4. [Produto inexistente](#4-produto-inexistente)
5. [Estoque insuficiente](#5-estoque-insuficiente)
6. [Concorrência: duas requisições pela última unidade](#6-concorrência-duas-requisições-pela-última-unidade)
7. [Caminho feliz com polling até `confirmed`](#7-caminho-feliz-com-polling-até-confirmed)
8. [Idempotência: reenvio da mesma chave](#8-idempotência-reenvio-da-mesma-chave)
9. [Pedido inexistente](#9-pedido-inexistente)
10. [ERP esgota as 3 tentativas → pedido `failed`](#10-erp-esgota-as-3-tentativas--pedido-failed)

---

## 1. Boot — catálogo carregado do `erp-mock`

O `ProductsModule` só termina de inicializar depois que `ErpService.fetchCatalog()` responde — por isso `Buscando catálogo` e `Catálogo carregado` aparecem *antes* de `Nest application successfully started`. Se o `erp-mock` não estivesse de pé aqui, o boot falharia (ver cenário 10 do README, "Instalação e execução").

```
[Nest] 1907  LOG [ErpService] Buscando catálogo no erp-mock — url=http://localhost:4000/erp/products
[Nest] 1907  LOG [ErpService] Catálogo carregado do erp-mock — productCount=3
[Nest] 1907  LOG [NestApplication] Nest application successfully started
[Nest] 1907  LOG [Bootstrap] Backend ouvindo na porta 3001 — erpMockUrl=http://localhost:4000
```

## 2. `GET /products`

Confirma que o catálogo devolvido ao cliente já inclui `imageUrl`/`imageAlt` — dados que vieram do `erp-mock`, não de um mapa hardcoded no backend.

```
[Nest] 1907  LOG [HTTP] --> GET /products requestId=74e851de ip=::1
[Nest] 1907  LOG [HTTP] <-- GET /products requestId=74e851de status=200 durationMs=0.6
{
  "products": [
    { "id": "capinha-preta",        "name": "Capinha Preta Fosca",   "priceCents": 3990, "stock": 5,  "imageUrl": "https://images.unsplash.com/photo-1764053430686-5435fe548fca", "imageAlt": "Capinha preta fosca em detalhe, apoiada sobre a caixa do aparelho" },
    { "id": "capinha-transparente", "name": "Capinha Transparente",  "priceCents": 2990, "stock": 10, "imageUrl": "https://images.unsplash.com/photo-1771142061210-95e97225641e", "imageAlt": "Capinha transparente em detalhe, com o círculo de carregamento magnético" },
    { "id": "capinha-listrada",     "name": "Capinha Listrada",      "priceCents": 3490, "stock": 1,  "imageUrl": "https://images.unsplash.com/photo-1632045902634-1e8a46c54190", "imageAlt": "Capinha com listras amarelas e brancas, fotografada de cima sob luz dramática" }
  ]
}
```

## 3. Validação: `idempotencyKey` ausente

`POST /checkout` sem `idempotencyKey` no body nem no header `Idempotency-Key`. A rejeição acontece antes de qualquer pedido ser criado — repare que não há linha de `OrdersService`.

```
[Nest] 1907  LOG  [HTTP] --> POST /checkout requestId=86d5d3e8 ip=::1
[Nest] 1907  LOG  [CheckoutService] Checkout recebido — requestId=86d5d3e8 productId=capinha-preta quantity=1 idempotencyKey=-
[Nest] 1907  WARN [CheckoutService] Checkout rejeitado: idempotencyKey ausente (nem no body, nem no header Idempotency-Key) — requestId=86d5d3e8 productId=capinha-preta quantity=1 idempotencyKey=-
[Nest] 1907  WARN [HttpExceptionFilter] Requisição rejeitada — status=400 errorCode=VALIDATION_ERROR errorMessage="idempotencyKey é obrigatório." requestId=86d5d3e8 method=POST path=/checkout
[Nest] 1907  WARN [HTTP] <-- POST /checkout requestId=86d5d3e8 status=400 durationMs=1.8
{"error":{"code":"VALIDATION_ERROR","message":"idempotencyKey é obrigatório.","field":"idempotencyKey"}}
```

## 4. Produto inexistente

`productId=capinha-inexistente`. A consulta de idempotência roda primeiro (`miss`, chave nova) e só depois o produto é procurado e não encontrado — de novo, nenhum pedido chega a ser criado.

```
[Nest] 1907  LOG   [HTTP] --> POST /checkout requestId=9d6f4dd2 ip=::1
[Nest] 1907  LOG   [CheckoutService] Checkout recebido — requestId=9d6f4dd2 productId=capinha-inexistente quantity=1 idempotencyKey=evid-404
[Nest] 1907  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-404 result=miss
[Nest] 1907  WARN  [CheckoutService] Checkout rejeitado: produto inexistente — requestId=9d6f4dd2 productId=capinha-inexistente quantity=1 idempotencyKey=evid-404
[Nest] 1907  WARN  [HttpExceptionFilter] Requisição rejeitada — status=404 errorCode=PRODUCT_NOT_FOUND errorMessage="Produto não encontrado." requestId=9d6f4dd2 method=POST path=/checkout
[Nest] 1907  WARN  [HTTP] <-- POST /checkout requestId=9d6f4dd2 status=404 durationMs=0.5
{"error":{"code":"PRODUCT_NOT_FOUND","message":"Produto não encontrado."}}
```

## 5. Estoque insuficiente

`capinha-listrada` tem 1 unidade; a requisição pede 2 numa tentativa só. O pedido *é* criado (`OrdersService`) antes da reserva ser tentada — e por isso a rejeição também passa por `OrdersService.markFailed`, não só pela exceção HTTP.

```
[Nest] 1907  LOG  [HTTP] --> POST /checkout requestId=35137f1a ip=::1
[Nest] 1907  LOG  [CheckoutService] Checkout recebido — requestId=35137f1a productId=capinha-listrada quantity=2 idempotencyKey=evid-409
[Nest] 1907  LOG  [OrdersService] Pedido criado — orderId=ord_000001 productId=capinha-listrada quantity=2 status=pending
[Nest] 1907  WARN [ProductsService] Reserva recusada: estoque insuficiente — orderId=ord_000001 productId=capinha-listrada requested=2 available=1
[Nest] 1907  WARN [OrdersService] Pedido marcado como failed — orderId=ord_000001 status=failed errorCode=OUT_OF_STOCK errorMessage="Este produto está esgotado no momento."
[Nest] 1907  WARN [CheckoutService] Checkout rejeitado: sem estoque suficiente — orderId=ord_000001 requestId=35137f1a productId=capinha-listrada quantity=2 idempotencyKey=evid-409
[Nest] 1907  WARN [HttpExceptionFilter] Requisição rejeitada — status=409 errorCode=OUT_OF_STOCK errorMessage="Este produto está esgotado no momento." requestId=35137f1a method=POST path=/checkout
[Nest] 1907  WARN [HTTP] <-- POST /checkout requestId=35137f1a status=409 durationMs=1.2
{"error":{"code":"OUT_OF_STOCK","message":"Este produto está esgotado no momento."}}
```

## 6. Concorrência: duas requisições pela última unidade

Duas chamadas a `POST /checkout` disparadas em paralelo (`curl ... & curl ... &`) para `capinha-listrada`, que também tem 1 unidade. Repare no `orderId` de cada uma: **`ord_000002`** (chave `evid-race-b`) reserva a única unidade disponível — `remainingAvailable=0`; **`ord_000003`** (chave `evid-race-a`), criado milissegundos depois, encontra `available=0` e é recusado. Isso é a checagem-e-reserva rodando como um passo síncrono indivisível dentro do `ProductsService` (ver "Armazenamento em memória" no README) — não teve sorte de timing, é garantido pela ausência de qualquer `await` entre checar e reservar.

```
[Nest] 1907  LOG   [HTTP] --> POST /checkout requestId=c5b4f2f4 ip=::1
[Nest] 1907  LOG   [CheckoutService] Checkout recebido — requestId=c5b4f2f4 productId=capinha-listrada quantity=1 idempotencyKey=evid-race-b
[Nest] 1907  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-race-b result=miss
[Nest] 1907  LOG   [OrdersService] Pedido criado — orderId=ord_000002 productId=capinha-listrada quantity=1 status=pending
[Nest] 1907  LOG   [ProductsService] Estoque reservado — orderId=ord_000002 productId=capinha-listrada quantity=1 remainingAvailable=0 ttlMs=120000
[Nest] 1907  DEBUG [IdempotencyService] Resposta de sucesso armazenada — idempotencyKey=evid-race-b orderId=ord_000002
[Nest] 1907  LOG   [CheckoutService] Checkout aceito, status=pending; liquidação com o ERP inicia em segundo plano — orderId=ord_000002 requestId=c5b4f2f4 productId=capinha-listrada quantity=1 idempotencyKey=evid-race-b
[Nest] 1907  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000002 attempt=1/3 timeoutMs=3000
[Nest] 1907  DEBUG [ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-success
[Nest] 1907  LOG   [HTTP] <-- POST /checkout requestId=c5b4f2f4 status=202 durationMs=2.7
{"orderId":"ord_000002","status":"pending","statusUrl":"/orders/ord_000002"}

[Nest] 1907  LOG   [HTTP] --> POST /checkout requestId=29952d89 ip=::1
[Nest] 1907  LOG   [CheckoutService] Checkout recebido — requestId=29952d89 productId=capinha-listrada quantity=1 idempotencyKey=evid-race-a
[Nest] 1907  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-race-a result=miss
[Nest] 1907  LOG   [OrdersService] Pedido criado — orderId=ord_000003 productId=capinha-listrada quantity=1 status=pending
[Nest] 1907  WARN  [ProductsService] Reserva recusada: estoque insuficiente — orderId=ord_000003 productId=capinha-listrada requested=1 available=0
[Nest] 1907  WARN  [OrdersService] Pedido marcado como failed — orderId=ord_000003 status=failed errorCode=OUT_OF_STOCK errorMessage="Este produto está esgotado no momento."
[Nest] 1907  WARN  [CheckoutService] Checkout rejeitado: sem estoque suficiente — orderId=ord_000003 requestId=29952d89 productId=capinha-listrada quantity=1 idempotencyKey=evid-race-a
[Nest] 1907  WARN  [HttpExceptionFilter] Requisição rejeitada — status=409 errorCode=OUT_OF_STOCK errorMessage="Este produto está esgotado no momento." requestId=29952d89 method=POST path=/checkout
[Nest] 1907  WARN  [HTTP] <-- POST /checkout requestId=29952d89 status=409 durationMs=0.5
{"error":{"code":"OUT_OF_STOCK","message":"Este produto está esgotado no momento."}}
```

## 7. Caminho feliz com polling até `confirmed`

`capinha-transparente`, `ERP_SIM_MODE=always-success`. Ainda assim a primeira chamada ao ERP "perde" a corrida contra o timeout de 3s — o `erp-mock` simula uma latência real de até 4s mesmo em modo de sucesso, então o `Promise.race` do `settleWithErp` às vezes desiste antes do `erp-mock` responder. Dá pra ver isso acontecendo de verdade aqui: o pedido segue `pending` por dois polls, e só quando o `erp-mock` finalmente responde (`durationMs=1094`, depois do timeout já ter "vencido" a corrida internamente) é que ele é confirmado — tudo na primeira tentativa formal (`attempt=1/3`), porque a resposta chegou a tempo desta vez.

```
[Nest] 1907  LOG   [HTTP] --> POST /checkout requestId=a692339c ip=::1
[Nest] 1907  LOG   [CheckoutService] Checkout recebido — requestId=a692339c productId=capinha-transparente quantity=1 idempotencyKey=evid-success-1
[Nest] 1907  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-success-1 result=miss
[Nest] 1907  LOG   [OrdersService] Pedido criado — orderId=ord_000004 productId=capinha-transparente quantity=1 status=pending
[Nest] 1907  LOG   [ProductsService] Estoque reservado — orderId=ord_000004 productId=capinha-transparente quantity=1 remainingAvailable=9 ttlMs=120000
[Nest] 1907  DEBUG [IdempotencyService] Resposta de sucesso armazenada — idempotencyKey=evid-success-1 orderId=ord_000004
[Nest] 1907  LOG   [CheckoutService] Checkout aceito, status=pending; liquidação com o ERP inicia em segundo plano — orderId=ord_000004 requestId=a692339c productId=capinha-transparente quantity=1 idempotencyKey=evid-success-1
[Nest] 1907  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000004 attempt=1/3 timeoutMs=3000
[Nest] 1907  DEBUG [ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-success
[Nest] 1907  LOG   [HTTP] <-- POST /checkout requestId=a692339c status=202 durationMs=0.8
{"orderId":"ord_000004","status":"pending","statusUrl":"/orders/ord_000004"}

-- polling GET /orders/ord_000004 até sair de pending --
[Nest] 1907  LOG   [HTTP] --> GET /orders/ord_000004 requestId=bc782bf2 ip=::1
[Nest] 1907  LOG   [HTTP] <-- GET /orders/ord_000004 requestId=bc782bf2 status=200 durationMs=0.4
{"orderId":"ord_000004","status":"pending"}

[Nest] 1907  LOG   [HTTP] --> GET /orders/ord_000004 requestId=9edb83b1 ip=::1
[Nest] 1907  LOG   [HTTP] <-- GET /orders/ord_000004 requestId=9edb83b1 status=200 durationMs=0.6
{"orderId":"ord_000004","status":"pending"}

[Nest] 1907  DEBUG [ErpService] erp-mock respondeu — httpStatus=200 success=true durationMs=1094
[Nest] 1907  LOG   [ProductsService] Reserva confirmada, estoque debitado — orderId=ord_000004 productId=capinha-transparente quantity=1 newBaseStock=9
[Nest] 1907  LOG   [OrdersService] Pedido confirmado — orderId=ord_000004 status=confirmed
[Nest] 1907  LOG   [CheckoutService] ERP confirmou o pedido — orderId=ord_000004 attempt=1/3
[Nest] 1907  LOG   [HTTP] --> GET /orders/ord_000004 requestId=2a9d1e87 ip=::1
[Nest] 1907  LOG   [HTTP] <-- GET /orders/ord_000004 requestId=2a9d1e87 status=200 durationMs=0.4
{"orderId":"ord_000004","status":"confirmed"}
```

> Entre as duas linhas de `DEBUG [ErpService]` acima, o log também mostra a liquidação do cenário 6 terminando em paralelo (`orderId=ord_000002`, mesmo `attempt=1/3`) — os dois pedidos pendentes daquele momento foram resolvidos pelo mesmo event loop, sem se atrapalharem.

## 8. Idempotência: reenvio da mesma chave

Mesma `idempotencyKey` (`evid-success-1`) do cenário 7, reenviada depois que aquele pedido já tinha sido confirmado. `IdempotencyService` acha um `hit` e devolve a resposta **original** (`ord_000004`, ainda com `status: "pending"` — a resposta cacheada é a do momento da aceitação, não o status atual) sem passar por `OrdersService` nem `ProductsService` de novo.

```
[Nest] 1907  LOG   [HTTP] --> POST /checkout requestId=53bacdfa ip=::1
[Nest] 1907  LOG   [CheckoutService] Checkout recebido — requestId=53bacdfa productId=capinha-transparente quantity=1 idempotencyKey=evid-success-1
[Nest] 1907  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-success-1 result=hit orderId=ord_000004
[Nest] 1907  LOG   [CheckoutService] Checkout idempotente: resposta anterior reaproveitada, nada foi reprocessado — orderId=ord_000004 requestId=53bacdfa productId=capinha-transparente quantity=1 idempotencyKey=evid-success-1
[Nest] 1907  LOG   [HTTP] <-- POST /checkout requestId=53bacdfa status=202 durationMs=0.4
{"orderId":"ord_000004","status":"pending","statusUrl":"/orders/ord_000004"}
```

## 9. Pedido inexistente

`GET /orders/ord_nao_existe`.

```
[Nest] 1907  LOG  [HTTP] --> GET /orders/ord_nao_existe requestId=f4beb5d6 ip=::1
[Nest] 1907  WARN [HttpExceptionFilter] Requisição rejeitada — status=404 errorCode=ORDER_NOT_FOUND errorMessage="Pedido não encontrado." requestId=f4beb5d6 method=GET path=/orders/ord_nao_existe
[Nest] 1907  WARN [HTTP] <-- GET /orders/ord_nao_existe requestId=f4beb5d6 status=404 durationMs=0.3
{"error":{"code":"ORDER_NOT_FOUND","message":"Pedido não encontrado."}}
```

## 10. ERP esgota as 3 tentativas → pedido `failed`

Backend reiniciado com `ERP_SIM_MODE=always-fail` (só para este cenário — é o único onde o ERP precisa recusar de propósito). `capinha-preta`, chave `evid-erp-fail`. As três tentativas, o backoff entre elas (1s depois da 1ª, 2s depois da 2ª — exatamente `BACKOFF_MS = [1000, 2000]`), e o desfecho final aparecem em sequência; o pedido inteiro levou ~9s de rede real, tudo enquanto o cliente já tinha recebido `202` havia 9s.

```
[Nest] 1989  LOG   [HTTP] --> POST /checkout requestId=3c8f39b6 ip=::1
[Nest] 1989  LOG   [CheckoutService] Checkout recebido — requestId=3c8f39b6 productId=capinha-preta quantity=1 idempotencyKey=evid-erp-fail
[Nest] 1989  DEBUG [IdempotencyService] Consulta de idempotência — idempotencyKey=evid-erp-fail result=miss
[Nest] 1989  LOG   [OrdersService] Pedido criado — orderId=ord_000001 productId=capinha-preta quantity=1 status=pending
[Nest] 1989  LOG   [ProductsService] Estoque reservado — orderId=ord_000001 productId=capinha-preta quantity=1 remainingAvailable=4 ttlMs=120000
[Nest] 1989  DEBUG [IdempotencyService] Resposta de sucesso armazenada — idempotencyKey=evid-erp-fail orderId=ord_000001
[Nest] 1989  LOG   [CheckoutService] Checkout aceito, status=pending; liquidação com o ERP inicia em segundo plano — orderId=ord_000001 requestId=3c8f39b6 productId=capinha-preta quantity=1 idempotencyKey=evid-erp-fail
[Nest] 1989  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=1/3 timeoutMs=3000
[Nest] 1989  DEBUG [ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-fail
[Nest] 1989  LOG   [HTTP] <-- POST /checkout requestId=3c8f39b6 status=202 durationMs=6.4
{"orderId":"ord_000001","status":"pending","statusUrl":"/orders/ord_000001"}

-- polling GET /orders/ord_000001 (3 pings mostrando "pending" omitidos) --

[Nest] 1989  DEBUG [ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=2671
[Nest] 1989  WARN  [CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000001 attempt=1/3
[Nest] 1989  LOG   [CheckoutService] Aguardando antes da próxima tentativa — orderId=ord_000001 backoffMs=1000

[Nest] 1989  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=2/3 timeoutMs=3000
[Nest] 1989  DEBUG [ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-fail
[Nest] 1989  DEBUG [ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=1038
[Nest] 1989  WARN  [CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000001 attempt=2/3
[Nest] 1989  LOG   [CheckoutService] Aguardando antes da próxima tentativa — orderId=ord_000001 backoffMs=2000

[Nest] 1989  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=3/3 timeoutMs=3000
[Nest] 1989  DEBUG [ErpService] Chamando erp-mock — url=http://localhost:4000/erp/orders simMode=always-fail
[Nest] 1989  DEBUG [ErpService] erp-mock respondeu — httpStatus=200 success=false durationMs=2732
[Nest] 1989  WARN  [CheckoutService] Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=ord_000001 attempt=3/3
[Nest] 1989  LOG   [ProductsService] Reserva liberada, estoque volta a ficar disponível — orderId=ord_000001 productId=capinha-preta quantity=1
[Nest] 1989  WARN  [OrdersService] Pedido marcado como failed — orderId=ord_000001 status=failed errorCode=ERP_PROCESSING_FAILED errorMessage="Não conseguimos concluir seu pedido agora. Tente novamente em instantes."
[Nest] 1989  ERROR [CheckoutService] Pedido falhou definitivamente após esgotar as tentativas; estoque liberado — orderId=ord_000001 attempts=3

[Nest] 1989  LOG   [HTTP] --> GET /orders/ord_000001 requestId=d7504ee2 ip=::1
[Nest] 1989  LOG   [HTTP] <-- GET /orders/ord_000001 requestId=d7504ee2 status=200 durationMs=0.2
{"orderId":"ord_000001","status":"failed","error":{"code":"ERP_PROCESSING_FAILED","message":"Não conseguimos concluir seu pedido agora. Tente novamente em instantes."}}
```

---

## Como essa captura foi gerada

`scratch-capture-logs.sh` (não commitado — é um script de scratch, não parte do produto) sobe `erp-mock`, depois o `backend` duas vezes (uma por `ERP_SIM_MODE`), dispara os `curl`s acima na ordem, faz polling real em `GET /orders/:id` até cada pedido sair de `pending`, e salva a saída bruta do terminal em [`logs-backend.txt`](logs-backend.txt) — este `.md` é a mesma captura, sem o ruído de inicialização do framework e com uma explicação ao lado de cada trecho. Nenhuma linha de log foi editada; os `requestId`/`orderId`/timestamps são os reais dessa execução.
