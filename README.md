# CaseCellShop — Checkout (branch `redis`)

> **Esta branch demonstra a Fase 1 (Redis) da evolução descrita no README de `main`.** O checkout, o contrato HTTP e a UI são idênticos aos de `main` — a mesma suíte `e2e/` passa sem nenhuma alteração nela — só a infraestrutura por baixo mudou: reserva de estoque, idempotência e persistência de pedidos deixam de viver em `Map`s do processo Node e passam a viver no Redis (script Lua para atomicidade, TTL nativo para expiração de reserva). O objetivo é validar as ADR-001/002/003 de [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md) contra infraestrutura de verdade, não só como texto. O que mudou em relação a `main` está resumido em ["Armazenamento: Redis, não mais em memória"](#armazenamento-redis-não-mais-em-memória) mais abaixo; o resto deste README é herdado de `main` e continua valendo sem alteração.

Uma fatia fullstack executável de uma jornada de checkout de e-commerce: o cliente escolhe um produto e uma quantidade, tenta comprar, e o sistema garante que nunca vende além do estoque disponível, nunca duplica um pedido em caso de retry ou duplo clique, e sempre responde rápido mesmo quando o sistema de ERP usado como backend de faturamento está lento ou instável.

O repositório contém três processos Node.js independentes — `erp-mock/`, `backend/`, `frontend/` — mais um `docker-compose.yml` só com o Redis (nesta branch, o backend depende dele; `main` não precisa de Docker). Um quarto pacote, `e2e/`, contém testes end-to-end (Playwright) que sobem os três serviços juntos e dirigem um navegador real contra a aplicação.

## Sumário

- [Itens bônus entregues](#itens-bônus-entregues)
- [Como rodar](#como-rodar)
  - [Pré-requisitos](#pré-requisitos)
  - [Em um único comando](#em-um-único-comando)
  - [Passo a passo manual](#passo-a-passo-manual)
- [Rodando os testes](#rodando-os-testes)
- [Cenários de teste manual](#cenários-de-teste-manual)
- [Demonstrando a simulação de lentidão/instabilidade do ERP](#demonstrando-a-simulação-de-lentidãoinstabilidade-do-erp)
- [Arquitetura e principais decisões técnicas](#arquitetura-e-principais-decisões-técnicas)
  - [Fora de escopo](#fora-de-escopo)
- [Próximos passos: Redis (Fase 1) e Redis com fila (Fase 2)](#próximos-passos-redis-fase-1-e-redis-com-fila-fase-2)
- [Contrato da API (resumo)](#contrato-da-api-resumo)
- [Evidências e testes automatizados](#evidências-e-testes-automatizados)
- [Troubleshooting](#troubleshooting)
- [Leitura complementar](#leitura-complementar)

## Itens bônus entregues

| Item bônus | Onde ver | Resultado |
|---|---|---|
| Diagrama de arquitetura | [Arquitetura e principais decisões técnicas](#arquitetura-e-principais-decisões-técnicas) | Fluxo completo usuário → frontend → backend → `erp-mock`, com o Redis como fronteira de estado explícita |
| Logs estruturados | [Rastreabilidade](#rastreabilidade-logs-estruturados-em-todo-o-fluxo) · [`evidencias/logs-backend.md`](evidencias/logs-backend.md) | Captura real cobrindo caminho feliz, os 4 tipos de erro, concorrência pela última unidade, idempotência e esgotamento de retry com o ERP |
| Endpoint de status do pedido | `GET /orders/:id` | Retorna `pending` / `confirmed` / `failed` (com `error.code`/`error.message` quando falha) |
| Teste de concorrência | [Armazenamento: Redis](#armazenamento-redis-não-mais-em-memória) | Várias requisições simultâneas pela última unidade de estoque — exatamente uma reserva passa, as demais recusadas com `409` (agora garantido por um script Lua atômico, não pelo event loop do Node) |
| Documentação interativa da API (Swagger/OpenAPI) | `http://localhost:3001/docs` (schema em `/docs-json`, com o backend rodando) | Gerada a partir dos mesmos decorators dos controllers — sempre sincronizada com o código, nunca desatualizada |

---

## Como rodar

### Pré-requisitos

- Node.js 20 LTS
- npm
- Docker (só para o Redis local — `docker compose up -d redis`); sem Docker Desktop, um `redis-server` instalado localmente (ex. `brew install redis`) também serve, desde que esteja escutando em `redis://localhost:6379`

### Em um único comando

```bash
npm run install:all   # instala erp-mock, backend e frontend de uma vez
npm run dev            # sobe o Redis (docker compose), depois os três juntos, com saída colorida e prefixada
```

> **Dica:** os dois comandos rodam na raiz do repositório (`package.json` novo, com [`concurrently`](https://www.npmjs.com/package/concurrently) orquestrando os três processos Node; um hook `predev` sobe o Redis via `docker compose up -d redis` e espera ele responder antes de continuar — `scripts/wait-for-redis.sh`). `Ctrl+C` derruba os três processos Node de uma vez (o Redis continua rodando no Docker; `docker compose down` para ele). É equivalente ao passo a passo manual abaixo — use aquele se quiser rodar/reiniciar um serviço isoladamente, ou este para o dia a dia.

### Passo a passo manual

> **Importante:** Redis primeiro (é uma dependência de boot do backend — sem ele, o backend não sobe), depois cada pacote independente em seu próprio terminal, **nesta ordem**: o backend busca o catálogo de produtos no `erp-mock` assim que sobe (e falha ao iniciar se não conseguir), então `erp-mock` precisa estar de pé antes dele; o frontend precisa do backend para qualquer dado real.

**0. Redis**

```bash
docker compose up -d redis
```

**1. ERP mock — porta 4000**

```bash
cd erp-mock
npm install
npm run dev
```

**2. Backend — porta 3001**

```bash
cd backend
npm install
npm run start:dev
```

**3. Frontend — porta 5173**

```bash
cd frontend
npm install
npm run dev
```

Abra `http://localhost:5173`. O servidor de desenvolvimento do Vite (frontend) faz proxy de `/api/*` para `http://localhost:3001` (veja `frontend/vite.config.ts`), então o navegador nunca fala diretamente com a porta do backend — apenas através desse proxy.

A API do backend tem documentação interativa (Swagger/OpenAPI) em `http://localhost:3001/docs` — schema completo (incluindo os corpos de erro de cada status) em `http://localhost:3001/docs-json`.

> **Nota:** nenhum dos três serviços precisa de arquivo `.env` para rodar com os valores padrão. As variáveis abaixo só importam se você quiser um comportamento diferente do default.

| Variável | Onde | Padrão | Para que serve |
|---|---|---|---|
| `PORT` | `erp-mock`/`backend` | `4000`/`3001` | Muda a porta do serviço |
| `REDIS_URL` | `backend` | `redis://localhost:6379` | Já é o que o `docker-compose.yml` expõe |
| `ERP_MOCK_URL` | `backend` | `http://localhost:4000` | URL da instância de `erp-mock` a ser chamada |
| `ERP_SIM_MODE` | `backend` | `random` | Repassada como header para o `erp-mock`, força um comportamento simulado específico — `always-success` / `always-fail` / `always-timeout` / `random` |
| `ERP_SIM_DELAY_MS` | `backend` | — | Idem, força um delay específico em vez do aleatório |

É assim que a suíte de testes e2e aponta o backend para uma instância de teste dedicada do `erp-mock` e conduz cada cenário de forma determinística; veja `backend/test/global-setup.ts` e `backend/src/erp/erp.service.ts`.

---

## Rodando os testes

| Pacote | Framework | Comando principal |
|---|---|---|
| `erp-mock/` | Jest + Supertest | `npm test` |
| `backend/` — unitários | Jest | `npm test` |
| `backend/` — e2e | Jest + Supertest | `npm run test:e2e` |
| `frontend/` | Vitest + React Testing Library | `npm test` |
| `e2e/` — Playwright | Playwright | `npm test` |
| `e2e/` — Playwright, ERP lento (isolada) | Playwright | `npm run test:erp-lento` |

### `erp-mock/`

Executado diretamente contra o `app` do Express, sem precisar vincular porta:

```bash
cd erp-mock
npm test               # ou npm run test:coverage para o relatório de cobertura
```

### `backend/`

```bash
cd backend
npm test                    # testes unitários (*.spec.ts) — regras de negócio de ProductsService e CheckoutService
npm run test:e2e            # testes end-to-end (*.e2e-spec.ts) — contrato HTTP completo, incl. concorrência e idempotência
npm run test:coverage       # cobertura dos unitários
npm run test:e2e:coverage   # cobertura da suíte e2e
```

> **Nota:** `npm run test:e2e` sobe o `erp-mock` automaticamente como um processo filho antes da suíte rodar e o encerra depois (`test/global-setup.ts` / `test/global-teardown.ts`, que fazem polling em `GET /health` antes de liberar os testes) — você **não** precisa ter o `erp-mock` já rodando em outro terminal especificamente para esse comando. Ele ainda é necessário como processo separado para o `start:dev`/uso manual do próprio backend, e para o fluxo do frontend acima.

### `frontend/`

React Testing Library + Vitest:

```bash
cd frontend
npm test               # ou npm run test:coverage para o relatório de cobertura
```

### `e2e/` (Playwright)

Sobe `erp-mock`, `backend` e `frontend` como processos reais (via `webServer` do `playwright.config.ts`) e dirige um navegador Chromium contra a UI — diferente das suítes acima, não testa uma unidade nem um contrato HTTP isolado:

```bash
cd e2e
npm install
npx playwright install chromium   # só na primeira vez
npm test
```

Cobre o caminho feliz, bloqueio por falta de estoque, duplo clique, validação de entrada e uma falha simulada do ERP com recuperação.

> **Atenção:** precisa que as portas 4000/3001/5173 estejam livres antes de rodar — encerre qualquer instância manual dos três serviços da seção ["Como rodar"](#como-rodar) primeiro.

Cada execução grava vídeo, screenshot e trace de cada teste em `e2e/test-results/` (git-ignorado); veja [`evidencias/`](evidencias/) na raiz do repositório para uma amostra já gravada.

> **Nota:** nesta branch, o backend do `webServer` roda com `REDIS_URL` apontando para um DB lógico dedicado (`redis://localhost:6379/2`, separado do `0` usado por `npm run dev` e do `1` usado pelos testes e2e do `backend/`), limpo automaticamente por um `globalSetup` (`e2e/global-setup.ts`) antes de cada execução — sem isso, o teste que espera "10 em estoque" no início falharia depois da primeira vez que alguém rodasse a suíte, porque o Redis (ao contrário do `Map` em memória de `main`) lembra o estoque entre execuções.

#### Suíte isolada: ERP lento de verdade

Uma segunda config do Playwright, dedicada a exercitar o modo `always-timeout` do ERP de verdade — não simulado no navegador. Detalhes de como e por quê na [seção sobre a simulação de lentidão/instabilidade do ERP](#demonstrando-a-simulação-de-lentidãoinstabilidade-do-erp) logo abaixo:

```bash
npm run test:erp-lento   # dentro de e2e/ — sobe um segundo trio de serviços, em portas próprias
npm run test:all         # roda as duas suítes Playwright em sequência
```

---

## Cenários de teste manual

Com os três serviços de pé (`npm run dev`, numa aba separada), `scripts/scenarios.sh` dispara cenários reais contra a API via `curl`, com saída legível — útil pra explorar o comportamento na mão sem escrever `curl` a cada vez:

```bash
scripts/scenarios.sh all   # roda todos os cenários abaixo (exceto erp-slow) em sequência
```

| Comando | O que faz |
|---|---|
| `products` | `GET /products`, formatado |
| `happy` | Checkout de 1 unidade, com polling até `confirmed` |
| `out-of-stock` | Pede mais unidades do que há em estoque disponível |
| `concurrency` | Dispara `estoque+1` requisições concorrentes pela última unidade, conta `202` vs. `409` |
| `idempotency` | Duas chamadas com a mesma `Idempotency-Key` no body, confirma que é o mesmo `orderId` |
| `idempotency-header` | O mesmo, mas mandando a chave no header `Idempotency-Key` em vez do body |
| `validation` | Três payloads inválidos (sem `productId`, `quantity` fracionária, `quantity` zero) → `400 VALIDATION_ERROR` |
| `not-found` | Checkout para um `productId` que não existe → `404 PRODUCT_NOT_FOUND` |
| `order-not-found` | Consulta um `orderId` que não existe → `404 ORDER_NOT_FOUND` |
| `erp-failure` | Roda um checkout e reporta o desfecho real do ERP |
| `erp-random` | 3 checkouts em sequência contra o modo `random` padrão, mostrando status e duração variando de tentativa pra tentativa |
| `erp-slow` | Checkout contra um backend iniciado com `ERP_SIM_MODE=always-timeout` — processamento lento de verdade, não simulado (ver seção abaixo) |
| `status <orderId>` | Consulta um pedido específico |

> **Nota:** o cenário `erp-failure` só é determinístico se o backend tiver sido iniciado com `ERP_SIM_MODE=always-fail npm run dev` (ver ["Como rodar"](#como-rodar) acima) — com o modo `random` padrão, o script avisa isso na tela e reporta o que aconteceu de verdade. O script não sobe nem derruba nenhum processo — só assume que `npm run dev` já está rodando em outra aba.

Só nesta branch, mais três comandos que exercitam o que o Redis muda de verdade:

| Comando | O que faz |
|---|---|
| `keys` | Inspeciona `order:*`, `product:stock:*`, `reservation:*` direto no `redis-cli`, sem passar pela API |
| `restart before` / `restart after <orderId>` | `before` cria um pedido e pede pra você reiniciar o backend manualmente (Ctrl+C + `npm run dev` de novo); `after` confirma que o pedido e o estoque sobreviveram — de propósito não é automático, já que derrubar o processo que você está olhando rodar em outro terminal não é algo que este script deveria fazer sozinho |
| `ttl` | Demo isolada do TTL nativo (`SET ... EX 3`) mostrando uma reserva sumir sozinha do Redis, sem nenhum código da aplicação envolvido |

---

## Demonstrando a simulação de lentidão/instabilidade do ERP

Esse é um pré-requisito explícito do case, então aqui vai o passo a passo direto:

O `erp-mock` (`erp-mock/src/app.ts`, endpoint `POST /erp/orders`) simula quatro modos, escolhidos pelo header `X-Erp-Simulate-Mode` que o backend envia em toda chamada — o backend, por sua vez, decide qual mandar a partir das variáveis de ambiente `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` com que foi iniciado:

| Modo | Comportamento no `erp-mock` |
|---|---|
| `random` (padrão, sem configurar nada) | Delay aleatório de 500–4000ms + ~80% de chance de sucesso — mistura lentidão e instabilidade organicamente, do jeito que um ERP real se comportaria |
| `always-timeout` | Dorme 10s antes de responder — **sempre** mais que o timeout de 3s que o backend usa (`Promise.race` em `checkout.service.ts`), então o backend sempre perde a corrida contra o relógio: é "processamento lento" no sentido mais literal do requisito |
| `always-fail` | Responde rápido, mas com `success: false` — falha determinística sem lentidão, para isolar o caso de "instabilidade" do caso de "lentidão" |
| `always-success` | Responde rápido com `success: true` — usado pelos cenários de caminho feliz, pra eles não dependerem de sorte |

O backend tenta até 3 vezes, com timeout de 3s por tentativa e backoff de 1s/2s entre elas (`CheckoutService.settleWithErp`) — o pedido só é marcado `failed`/`ERP_PROCESSING_FAILED` depois de esgotar as três. Três formas de ver isso rodando, da mais rápida pra mais completa:

#### 1. Automatizado, sem nenhum passo manual

```bash
cd e2e
npm run test:erp-lento
```

Isso sobe um segundo trio `erp-mock`+`backend`+`frontend` (portas 4001/3002/5174, isolado da suíte principal) com o backend em `ERP_SIM_MODE=always-timeout`, e dirige um navegador de verdade contra ele — sem `page.route()` nenhum fingindo a resposta: é o `Promise.race` real do backend perdendo contra o `erp-mock` real, três vezes, até a UI mostrar a mensagem de falha.

![Pedido falhando após 3 tentativas reais contra um ERP que nunca responde a tempo](evidencias/06-erp-lento-timeout-real.gif)

#### 2. Manual, via `scripts/scenarios.sh`

```bash
# terminal 1
cd backend && ERP_SIM_MODE=always-timeout npm run start:dev

# terminal 2 (erp-mock e frontend já de pé como de costume)
scripts/scenarios.sh erp-slow
```

O script acompanha o pedido até ele terminar `failed`. No log do backend, cada tentativa desiste em ~3s (não em 10s — é o timeout do backend vencendo, não o `erp-mock` respondendo rápido), e a resposta real do `erp-mock` chega bem depois, já ignorada:

```
19:20:48  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=1/3 timeoutMs=3000
19:20:51  WARN  [CheckoutService] Tentativa de liquidação falhou — orderId=ord_000001 attempt=1/3
19:20:51  LOG   [CheckoutService] Aguardando antes da próxima tentativa — orderId=ord_000001 backoffMs=1000
19:20:52  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=2/3 timeoutMs=3000
19:20:55  WARN  [CheckoutService] Tentativa de liquidação falhou — orderId=ord_000001 attempt=2/3
19:20:57  LOG   [CheckoutService] Chamando o ERP — orderId=ord_000001 attempt=3/3 timeoutMs=3000
19:21:00  WARN  [CheckoutService] Tentativa de liquidação falhou — orderId=ord_000001 attempt=3/3
19:21:00  ERROR [CheckoutService] Pedido falhou definitivamente após esgotar as tentativas — orderId=ord_000001 attempts=3
19:21:02  DEBUG [ErpService] erp-mock respondeu — httpStatus=200 success=true durationMs=10005   # tarde demais, já ignorada
```

Captura completa (todas as linhas, sem cortes) em [`evidencias/logs-backend.md`, seção 11](evidencias/logs-backend.md#11-erp-sempre-lento-always-timeout--promiserace-perdendo-contra-o-relógio).

#### 3. Sem reiniciar nada — o modo `random` padrão já demonstra a instabilidade ao vivo

```bash
scripts/scenarios.sh erp-random
```

Dispara 3 checkouts seguidos contra o backend já rodando do jeito padrão e mostra status/duração de cada um lado a lado — a variação entre eles **é** a simulação.

Captura real de terminal cobrindo os três modos (`always-success`, `always-fail`, `always-timeout`) está em [`evidencias/logs-backend.md`](evidencias/logs-backend.md), comentada trecho a trecho.

---

## Arquitetura e principais decisões técnicas

```mermaid
flowchart LR
    U(["Usuário"]) --> FE["Frontend\nReact + Tailwind"]
    FE -- "/api/* (proxy do Vite)" --> BE["Backend\nNestJS"]
    BE -- "GET /erp/products\n(cache-aside, TTL 30s)" --> ERP["erp-mock\nExpress"]
    BE -- "POST /erp/orders\n(liquidação: timeout 3s, retry, backoff)" --> ERP
    BE -- "Script Lua atômico:\nestoque · pedidos · idempotência" --> REDIS["Redis\n(Docker)"]
```

> A reserva de estoque, os pedidos e as chaves de idempotência vivem no Redis, não mais dentro do processo do backend — o `erp-mock` nunca é consultado durante a checagem-e-reserva (um script Lua atômico no Redis, ver "Armazenamento" abaixo), só na liquidação em segundo plano e nos refreshes periódicos do catálogo.

### Por que `erp-mock` é um serviço HTTP real separado, e não uma simulação in-process?

`erp-mock` roda como processo HTTP separado (rede real, não uma classe in-process) para poder exercitar um timeout que corre contra o relógio de verdade, e para que o modo de simulação seja **stateless e controlado por header** — sem estado mutável compartilhado entre chamadas concorrentes.

<details>
<summary>Por que isso importa (detalhes)?</summary>

O backend chama o `erp-mock` através de uma fronteira de rede real (HTTP, processo próprio, porta própria) em vez de simular o comportamento do ERP com uma classe in-process. Essa é uma escolha deliberada de gestão de risco, não incidental: uma simulação in-process não consegue exercitar os modos de falha que realmente importam para a resiliência do checkout — um timeout que de fato precisa correr contra o relógio (`Promise.race` perdendo, não apenas uma função retornando um erro), uma resposta lenta competindo com o próprio event loop do backend, e (arquiteturalmente, ver limitações abaixo) reset de conexão. Um segundo processo real também é o que obriga o modo de simulação do `erp-mock` a ser **stateless e controlado por header**, em vez de configuração no lado do servidor: duas tentativas de checkout concorrentes na mesma execução de teste podem exigir comportamentos simulados diferentes (`always-success` vs. `always-timeout`) sem disputar um estado mutável compartilhado.

O `erp-mock` é um serviço Express simples, e não uma segunda aplicação NestJS — é um dublê de teste representando um sistema fora do controle deste projeto, não parte do produto sendo construído.

</details>

**Limitações desta simulação — sendo honesto sobre os trade-offs:**

- `erp-mock` sempre responde HTTP `200`, em todo modo (`erp-mock/src/app.ts`) — nunca um status de erro real (`500`/`503`) nem uma conexão derrubada de propósito. O código que trata essa situação (`ErpService.fetchCatalog` lança se a resposta não for `ok`; `ErpService.call` trata como falha) só é exercitado com `fetch` mockado em `erp.service.spec.ts` — o próprio comentário desse arquivo admite que **nunca** é exercitado contra o `erp-mock` rodando de verdade.
- `always-timeout` simula lentidão (demora 10s, sempre mais que o timeout de 3s do backend) — a resposta chega, só chega tarde demais para importar (ver a [seção de ERP lento](#demonstrando-a-simulação-de-lentidãoinstabilidade-do-erp)). Isso **não** é um reset de conexão real (nenhum `socket.destroy()`/conexão abortada) — a arquitetura de processo separado torna isso possível de adicionar, ao contrário de uma simulação in-process, mas hoje não está implementado.
- Os dois processos rodam em `localhost` — sem a latência, perda de pacote, DNS ou negociação TLS de uma rede real. A fronteira HTTP é real; as condições de rede de produção, não.
- O modo `random` usa `Math.random()` sem seed — realista para uma demonstração, mas não reproduzível fora dos modos determinísticos por header (`always-*`).

Nada disso invalida o que a simulação prova de fato (timeout real vencendo a corrida contra o relógio, isolamento entre chamadas concorrentes) — mas `erp-mock` continua sendo um dublê simplificado, não um cliente HTTP resiliente completo, e vale listar onde a fidelidade termina em vez de deixar a evidência parecer mais completa do que é.

### Catálogo: o ERP é o dono dos dados, a loja só lê

Nesta branch, o `ProductsService` busca o catálogo com **cache-aside no Redis** (`catalog:products`, TTL 30s) em vez de uma busca única no boot — a primeira leitura depois que o cache expira busca no `erp-mock`, as seguintes nem tocam o ERP.

<details>
<summary>Por que isso importa (detalhes)?</summary>

Produto, preço, estoque contábil e a foto de cada capinha são dados que o `erp-mock` expõe em `GET /erp/products` — não um array chumbado dentro do backend. Nesta branch, o `ProductsService` busca esse catálogo com **cache-aside no Redis** (`catalog:products`, TTL 30s — ADR-001 de [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md)): a primeira leitura depois que o cache expira busca no `erp-mock` e regrava o cache; as leituras seguintes, dentro da janela de 30s, nem tocam o ERP. Um *warm-up* no boot (`ProductsService.onModuleInit`) preenche o cache antes do Nest aceitar requisições, preservando o mesmo comportamento de "falha ao iniciar se o `erp-mock` estiver fora do ar" que a versão em memória de `main` tem.

O ERP continua sendo o único *escritor* de catálogo/preço/estoque contábil, a loja sempre *leitora* — mas o estoque disponível para reserva (`product:stock:{productId}` no Redis) é semeado só na primeira vez que cada produto é visto (`SET ... NX`), nunca sobrescrito pelos refreshes seguintes do cache-aside: o `erp-mock` é estático e não sabe quando a loja confirma uma venda, então sobrescrever a cada refresh apagaria um débito de estoque já confirmado, reabrindo a porta para overselling — exatamente o problema que esta branch existe para fechar. É o mesmo comportamento que a versão em memória de `main` já tinha (buscar o catálogo uma vez, e daí em diante só a loja mexe no número), só que agora sobrevivendo a um restart. Depois que o estoque é semeado, a reserva/decremento continua inteiramente dentro do Redis (ver seção seguinte) — nenhuma chamada ao ERP acontece durante um checkout, só no boot e nos refreshes periódicos do catálogo.

</details>

### Por que NestJS, e não Express puro, no backend?

Agilidade de implementação: o Nest roda sobre o próprio Express por baixo (`@nestjs/platform-express`, o adapter padrão — não é um substituto, é uma camada de estrutura em cima dele) e resolve nativamente, via decorators, quatro coisas que em Express puro seriam bibliotecas separadas para escolher, integrar e manter sincronizadas à mão: injeção de dependências, modularização, validação de entrada e documentação da API.

<details>
<summary>Por que isso importa (detalhes)?</summary>

- **Injeção de dependências nativa** — cada `Service` recebe suas dependências pelo construtor, resolvidas automaticamente pelo container do Nest a partir do que cada `@Module` declara em `providers`/`imports`, sem fábrica manual escrita à mão. Exemplo real desta branch: `ProductsService` recebe `RedisService` e `ErpService` direto no construtor (`backend/src/products/products.service.ts`), puramente por declaração em `ProductsModule` — o carregamento do catálogo (cache-aside, ver ["Catálogo"](#catálogo-o-erp-é-o-dono-dos-dados-a-loja-só-lê) acima) acontece no lifecycle hook `onModuleInit`, não num construtor sobrecarregado.
- **Validação e documentação a partir da mesma fonte** — os decorators de `class-validator` (`@IsInt`, `@IsPositive`, ...) e de `@nestjs/swagger` (`@ApiProperty`, ...) convivem na mesma classe DTO (ex. `backend/src/checkout/checkout.dto.ts`). O `ValidationPipe` global (`backend/src/bootstrap.ts`) usa os primeiros para rejeitar payload inválido em runtime; o `SwaggerModule` usa os segundos para gerar a [documentação interativa](#itens-bônus-entregues) a partir do mesmíssimo arquivo — zero duplicação, documentação que não tem como ficar desatualizada em relação ao código.
- **Contrato de erro centralizado** — um único `HttpExceptionFilter` global (`app.useGlobalFilters` em `bootstrap.ts`) mapeia toda exceção de domínio para o corpo de erro HTTP, em vez de tratamento espalhado por middleware customizado.
- **Testes de integração contra a aplicação real** — `Test.createTestingModule({ imports: [AppModule] })` (`backend/test/utils/create-test-app.ts`) sobe a aplicação de verdade, com o mesmo grafo de dependências de produção (Redis incluído), em vez de recriar rotas e validação à mão só para os testes.

Em Express puro, cada um desses pontos seria uma biblioteca a mais para integrar (`express-validator`, `swagger-jsdoc`, middleware de erro próprio) e manter sincronizada manualmente — viável, mas é tempo de infraestrutura de framework, não de regra de negócio. É por isso que `erp-mock/` continua em Express puro e não vira uma segunda aplicação NestJS: é um dublê de teste de poucas linhas, sem regra de negócio nenhuma para essa agilidade importar (ver ["Por que `erp-mock` é um serviço HTTP real separado"](#por-que-erp-mock-é-um-serviço-http-real-separado-e-não-uma-simulação-in-process) acima).

</details>

### Arquitetura do backend: Controller, Service, Module

O backend segue uma estrutura NestJS direta — um `Controller`, um `Service`, um `Module` por assunto (`products/`, `orders/`, `idempotency/`, `erp/`, `checkout/`). Cada `Controller` faz apenas roteamento: nenhuma regra de negócio, nenhum mapeamento de erro para status HTTP (isso é centralizado uma única vez, no `HttpExceptionFilter` global). Cada `Service` é dono tanto da lógica de negócio quanto dos dados sobre os quais ela opera, em um só lugar, sem camadas de indireção adicionais entre o controller e a regra de negócio. Erros de domínio (produto não encontrado, estoque insuficiente, pedido não encontrado) são exceções tipadas que estendem `HttpException` diretamente, e métodos/variáveis usam o vocabulário real do negócio (`reserveStock`, `settleWithErp`, `idempotencyKey`) em vez de nomenclatura CRUD genérica.

`ProductsService` combina o catálogo de produtos e a reserva de estoque no mesmo serviço porque `GET /products` precisa dos dois, e separá-los em dois serviços que dependem um do outro criaria uma dependência circular sem benefício nesta escala.

### Armazenamento: Redis, não mais em memória

Estoque, pedidos e chaves de idempotência vivem no Redis (`docker-compose.yml`, persistência AOF habilitada) em vez de `Map`s no processo do backend — **a diferença central desta branch em relação a `main`, e o motivo dela existir**. A mesma garantia de correção (nunca vender além do estoque) continua vindo de uma operação indivisível, só que sustentada por um mecanismo diferente: em `main`, o event loop síncrono do Node garante que duas chamadas à mesma função nunca se intercalam; aqui, é o Redis que garante que um script Lua roda do início ao fim sem interrupção de outro comando — a mesma classe de garantia (atomicidade), infraestrutura diferente por baixo.

**Esquema de chaves:**

| Chave | Tipo | Papel |
|---|---|---|
| `catalog:products` | String (JSON), TTL 30s | Cache-aside do catálogo (nome/preço/imagem) |
| `product:stock:{productId}` | String (inteiro) | Estoque base — semeado uma vez (`SET NX`), só muda por confirmação de venda |
| `product:reservations:{productId}` | Hash `orderId → quantity` | Reservas já vistas para o produto, podadas de forma preguiçosa |
| `reservation:{orderId}` | String, TTL 120s | Fonte da verdade de "essa reserva ainda está ativa" — some sozinha quando o TTL expira |
| `order:{orderId}` | Hash | Os campos do pedido — sem TTL, é o que sustenta sobreviver a um restart |
| `order:seq` | Contador (`INCR`) | Gera `ord_NNNNNN` sem colisão entre restarts |

**Três scripts Lua** (`backend/src/redis/lua/*.lua`, registrados via `ioredis`'s `defineCommand`) cobrem as três operações que precisam ser atômicas: `reserveStock` (poda reservas expiradas, soma as ativas, compara com o estoque base, grava se couber), `confirmReservation` (debita o estoque base permanentemente e remove a reserva — no-op se ela já não existir, o que evita debitar duas vezes) e `releaseReservation` (remove a reserva sem debitar). Os três são revisáveis linha a linha nesses arquivos — é exatamente o que a ADR-002 pede como compliance ("revisão manual do script Lua no code review").

O teste e2e de concorrência (`backend/test/checkout.e2e-spec.ts`, mesmo texto de `main`) e um teste unitário adicional só desta branch (`products.service.spec.ts`, "lets only one of two concurrent reservations for the last unit succeed", rodando contra Redis real) são a garantia de regressão automatizada. Validado manualmente também, com captura de terminal real — matar o processo do backend (`kill -9`) e religá-lo mantém pedido e estoque exatamente como estavam, e uma reserva expira sozinha por TTL nativo do Redis sem nenhum código da aplicação envolvido — ver [`evidencias/logs-redis.md`](evidencias/logs-redis.md) para os oito cenários comentados (log bruto sem edição em [`evidencias/logs-redis.txt`](evidencias/logs-redis.txt)).

### Frontend: Tailwind e fotos reais dos produtos

Interface responsiva em Tailwind v4, produto selecionado por cards clicáveis (não `<select>`), e `frontend/src/` organizado por responsabilidade — separação que nasceu de um bug real, não só de gosto.

<details>
<summary>Por que isso importa (detalhes)?</summary>

A tela de checkout é responsiva (testada de ~360px a desktop) e usa Tailwind CSS v4 (via `@tailwindcss/vite`, sem arquivo de config separado — os tokens de cor e tipografia vivem em `frontend/src/index.css`). O seletor de produto deixou de ser um `<select>` para virar um grupo de cards clicáveis (`role="radiogroup"`, um `<input type="radio">` acessível por trás de cada card), porque a foto do produto — vinda de `product.imageUrl`/`imageAlt`, ver "Catálogo" acima — só faz sentido como algo grande o bastante para ver a textura da capinha; um dropdown não comporta isso. O card também mostra preço e estoque disponível, recarregado do backend assim que uma compra reserva ou libera estoque, sem precisar dar reload na página.

`frontend/src/` é organizado por responsabilidade, não por tipo de arquivo genérico:

- `services/` fala com o backend — um módulo por recurso (`products`, `checkout`, `orders`), cada um só com as chamadas `fetch` e os tipos daquele recurso;
- `hooks/` (`useProducts`, `useCheckout`) guardam o estado e a lógica de quando chamar cada serviço, incluindo o polling do status do pedido;
- `view/` são componentes de apresentação que só recebem props e renderizam;
- `controller/CheckoutController.tsx` é o único lugar que conecta hooks a views;
- `utils/` guarda funções puras sem estado (formatação de moeda, montagem de URL de imagem).

Essa separação usa o mesmo vocabulário do backend (`services`) de propósito, e existe por um motivo concreto, não só organização por gosto: antes, uma função de ~90 linhas fazia fetch, tratava todos os erros e renderizava tudo junto, e um erro de rede (não um erro HTTP — uma falha de conexão de verdade) não era capturado em lugar nenhum, deixando o botão "Processando..." travado para sempre. Isolar a chamada de rede dentro de `hooks/useCheckout.ts` tornou esse ponto óbvio o bastante para corrigir: agora `postCheckout`/`fetchOrderStatus` são chamados dentro de um `try/catch` que sempre leva a UI de volta a um estado de erro navegável.

</details>

### Por que a idempotência só guarda em cache a resposta de sucesso?

Uma requisição `POST /checkout` que falha na validação, ou aponta para um produto inexistente, ou esbarra em estoque insuficiente, é uma função pura da entrada e do nível de estoque atual — reenviar exatamente a mesma requisição recalcula exatamente a mesma resposta, sem efeito colateral para repetir acidentalmente. A única resposta que não é pura é o sucesso `202 pending`, porque ela tem um efeito colateral: cria um pedido e reserva estoque. Por isso só esse caminho é lembrado em relação à `Idempotency-Key` — reenviar a mesma chave retorna o pedido *original* em vez de criar um segundo pedido e reservar estoque em dobro.

### Rastreabilidade: logs estruturados em todo o fluxo

Cada classe tem seu próprio `Logger`, todo ponto de decisão é logado (não só erros), com formato `campo=valor` e duas chaves de correlação (`requestId`, `orderId`).

<details>
<summary>Por que isso importa (detalhes)?</summary>

Cada classe do backend tem seu próprio `Logger` do NestJS (`new Logger(NomeDaClasse.name)`), e todo ponto de decisão do fluxo é logado — não só os erros: pedido recebido, resposta idempotente reaproveitada, estoque reservado/recusado/confirmado/liberado (inclusive quando uma reserva expira sozinha por TTL), cada tentativa de chamada ao ERP com seu resultado, o backoff entre tentativas, e o desfecho final do pedido. As mensagens seguem um padrão consistente de `mensagem em português — campo1=valor1 campo2=valor2`, para ficarem ao mesmo tempo legíveis por humano e fáceis de grep. Os níveis são usados com intenção: `log` para o caminho esperado, `warn` para falhas de negócio recuperáveis (estoque insuficiente, tentativa de ERP que falhou mas ainda tem retry, um pedido marcado `failed`), `error` só para o que realmente esgotou as opções (falha definitiva após as 3 tentativas, exceção não tratada), e `debug` para ruído de diagnóstico de baixo sinal (hit/miss de idempotência, guards que decidiram não fazer nada).

Duas chaves de correlação amarram essas linhas: um `requestId` curto, gerado por `RequestLoggerMiddleware` para toda requisição HTTP (reaproveita um `X-Request-Id` recebido, se houver, e sempre devolve um no header de resposta) e logado nas linhas de entrada/saída (`--> POST /checkout ...` / `<-- POST /checkout ... status=202 durationMs=...`); e o `orderId`, que passa a ser a chave de correlação a partir do momento em que um pedido existe — inclusive na liquidação assíncrona com o ERP, que roda bem depois da requisição HTTP original já ter sido respondida e por isso não tem mais um `requestId` "ativo" a que se prender.

</details>

Uma captura real desses logs, cobrindo o caminho feliz, os quatro tipos de erro (`400`/`404`/`409`/pedido `failed`), duas tentativas concorrentes pela última unidade de um produto, o reaproveitamento idempotente, e o esgotamento das 3 tentativas contra o ERP, está em [`evidencias/logs-backend.md`](evidencias/logs-backend.md) (comentada cenário a cenário; a saída de terminal bruta e sem edições fica em [`evidencias/logs-backend.txt`](evidencias/logs-backend.txt)).

### Fora de escopo

- **Autenticação, pagamento real, deploy em nuvem.** (Docker deixa de ser opcional nesta branch — é como o Redis local sobe; ver [Pré-requisitos](#pré-requisitos) para a alternativa sem Docker Desktop.)
- **Carrinho com múltiplos itens** — o checkout permanece single-item (`productId` + `quantity`) porque nenhuma das garantias centrais deste projeto (consistência de estoque, idempotência, concorrência, contrato de erro) depende de um carrinho; adicionar um transformaria a reserva indivisível de um único produto em um problema de write-skew multi-objeto, exigindo um redesign, não uma extensão incremental.
- **Fila durável (RabbitMQ/BullMQ), banco de dados dedicado, sincronização por CDC com um ERP real** — pertencem a uma evolução de produção deste desenho, não a este mini-projeto de código.
- **Um cron de reconciliação automatizado de verdade**, rodando como processo agendado real — documentado aqui como próximo passo; `GET /orders/:id` já cobre a necessidade imediata de ver o status atual de um pedido.
- **Testes de contrato formais (Pact) e testes de carga/performance** — próximo passo, não prioridade para esta entrega.
- **Um layout de UI elaborado** — não é o foco desta entrega.

---

## Próximos passos: Redis (Fase 1) e Redis com fila (Fase 2)

O em-memória do mini-projeto original (`main`) é uma escolha deliberada de escopo, não desconhecimento do que uma versão de produção exige — as ADRs de [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md) já especificam essa evolução em fases, respondendo à Pergunta 1/2 de [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md). Esta branch (`redis`) já materializa a Fase 1 como código real, validado em [`evidencias/logs-redis.md`](evidencias/logs-redis.md); a Fase 2 (`redis-queue`) segue só planejada, não construída, para comparar as três versões lado a lado sob os mesmos testes de concorrência/idempotência:

| | **`main`** | **Esta branch (`redis`, Fase 1)** | **Branch planejada `redis-queue`** (Fase 2) |
|---|---|---|---|
| Reserva de estoque | `Map` em memória, checagem-e-reserva síncrona no processo | Script Lua no Redis, mesma garantia de operação atômica (ADR-002) | Igual à Fase 1 |
| Idempotência | `Map` em memória, sem TTL (processo de vida curta) | Chave no Redis, TTL 24h (ADR-003) | Igual à Fase 1 |
| Liquidação com o ERP | Retry in-process (3x, backoff), sem fila | Igual ao mini-projeto (ADR-004) | Fila durável (BullMQ/RabbitMQ) com dead-letter queue — o pedido nunca se perde num restart (ADR-005) |
| Persistência de pedidos/estoque | Só no processo — perde tudo num restart | Redis — sobrevive a um restart do processo da loja | Banco próprio da loja (Postgres); Redis vira só fila/cache |
| Catálogo | Busca única no `erp-mock`, no boot | Cache-aside com TTL curto (~30s) (ADR-001) | Igual à Fase 1 |
| Infraestrutura extra | Nenhuma — só Node.js | +1 Redis | +Redis, +fila, +Postgres |

> **Nota:** o porquê de branches separadas em vez de uma flag de configuração: cada fase troca uma garantia de corretude por uma peça de infraestrutura diferente (Redis primeiro, banco+fila depois) — misturar as três num único código com `if`s de ambiente esconderia exatamente o trade-off que vale a pena mostrar. Cada branch reaproveita os mesmos testes de concorrência e idempotência deste mini-projeto como critério de aceite: a garantia observável (nunca vende além do estoque, nunca duplica pedido) tem que se manter idêntica trocando só a infraestrutura por baixo.

---

## Contrato da API (resumo)

| Endpoint | Parâmetros | Sucesso | Erros |
|---|---|---|---|
| `GET /products` | — | `200` — lista o catálogo com o estoque *disponível* de cada produto (estoque base menos reservas ativas) | — |
| `POST /checkout` | Corpo `{ productId, quantity, idempotencyKey }` (a chave também pode ir no header `Idempotency-Key`) | `202` `{ orderId, status: "pending", statusUrl }` | `400 VALIDATION_ERROR` · `404 PRODUCT_NOT_FOUND` · `409 OUT_OF_STOCK` |
| `GET /orders/:id` | — | `200` — status atual do pedido (`pending` \| `confirmed` \| `failed`, com `error: { code, message }` quando `failed`) | `404 ORDER_NOT_FOUND` |

O contrato exato, incluindo cada campo e código de status, está detalhado em [`specs/spec.md`](specs/spec.md) — e, de forma sempre sincronizada com o código (gerada a partir dos mesmos decorators dos controllers), em `http://localhost:3001/docs` com o backend rodando.

---

## Evidências e testes automatizados

A pasta [`evidencias/`](evidencias/) contém gravações em vídeo (`.webm`, bruto) de uma execução real da suíte `e2e/`, uma por cenário; os três mais recentes também têm uma versão `.gif` embutida aqui, pra não precisar baixar nada pra ver o resultado:

| Cenário | Arquivo | Resultado |
|---|---|---|
| Caminho feliz | [`01-caminho-feliz.webm`](evidencias/01-caminho-feliz.webm) | Seleciona um produto, confirma a compra, o polling chega em "Compra confirmada!" contra o backend real (ERP simulado forçado a sempre ter sucesso), estoque exibido no card cai de 10 para 9 sem reload |
| Estoque insuficiente | [`02-estoque-insuficiente.webm`](evidencias/02-estoque-insuficiente.webm) | Pede mais unidades do que há em estoque numa única tentativa; backend rejeita antes de reservar qualquer coisa, UI mostra "Este produto está esgotado no momento." |
| Falha do ERP e retry | [`03-falha-erp-e-retry.webm`](evidencias/03-falha-erp-e-retry.webm) | Primeira tentativa falha (interceptação de rede do navegador, sem alterar código da aplicação), UI mostra a mensagem de falha temporária; segunda tentativa, sem interceptação, recupera normalmente |
| Duplo clique bloqueado | [`04-duplo-clique-bloqueado.webm`](evidencias/04-duplo-clique-bloqueado.webm) | Botão "Comprar" vira "Processando..." e fica desabilitado assim que clicado — antes mesmo do pedido terminar |
| Validação de quantidade inválida | [`05-validacao-quantidade-invalida.webm`](evidencias/05-validacao-quantidade-invalida.webm) | `quantity=0` enviado de verdade ao backend (sem bloqueio no front), volta `400` e a UI mostra a mensagem exata da validação |
| ERP lento (real) | [`06-erp-lento-timeout-real.webm`](evidencias/06-erp-lento-timeout-real.webm) | Ver a [seção dedicada acima](#demonstrando-a-simulação-de-lentidãoinstabilidade-do-erp) — 3 tentativas reais perdendo a corrida contra o timeout, sem nenhuma simulação no navegador |

> **Nota:** essas gravações não substituem a suíte automatizada — são uma amostra point-in-time de uma execução; a fonte da verdade é sempre rodar `npm test`/`npm run test:erp-lento` em `e2e/` (ou as suítes unitárias/e2e de cada pacote, na seção anterior).

[`evidencias/logs-backend.md`](evidencias/logs-backend.md) complementa isso do lado do backend: captura real do terminal rodando o backend três vezes (`ERP_SIM_MODE=always-success`, `always-fail` e `always-timeout`) e disparando `curl` contra cada cenário, comentada trecho a trecho.

| Cenário coberto | Resultado |
|---|---|
| Caminho feliz | Pedido `202 pending` → `confirmed` após liquidação com o ERP |
| `400`/`404`/`409` | Corpo de erro tipado retornado e logado em cada caso (validação, produto inexistente, estoque insuficiente) |
| Concorrência | Duas tentativas simultâneas pela última unidade — uma reserva, a outra recusada |
| Idempotência | Mesma `Idempotency-Key` reenviada retorna o pedido original, sem duplicar reserva |
| Falha do ERP | 3 tentativas esgotadas com backoff, pedido termina `failed` com `ERP_PROCESSING_FAILED` |

Só desta branch: [`evidencias/logs-redis.md`](evidencias/logs-redis.md) valida especificamente o que mudou — reserva atômica via Lua sob concorrência, pedido e estoque sobrevivendo a um `kill -9` do processo, e uma reserva expirando sozinha por TTL nativo do Redis:

| Cenário coberto (só nesta branch) | Resultado |
|---|---|
| Restart do processo (`kill -9` + religa) | Pedido e estoque idênticos a antes do restart — não seria verdade em `main` |
| TTL nativo de uma reserva | Chave some sozinha do Redis, sem cron nem sweep da aplicação |
| Inspeção direta das chaves (`redis-cli`) | Confirma que o esquema de chaves descrito acima é real, não só a API respondendo certo |

[`evidencias/coverage-report.md`](evidencias/coverage-report.md) traz os números reais de cobertura (`--coverage` do Jest/Vitest, não estimados) de cada suíte, com o texto bruto de cada ferramenta:

| Suíte | Statements | Testes |
|---|---|---|
| `backend` — unitários | 78.65% | 20 |
| `backend` — e2e | 92.23% | 15 |
| `erp-mock` | 96.15% | 7 |
| `frontend` | 82.11% | 8 |

---

## Troubleshooting

| Sintoma | O que fazer |
|---|---|
| `Error: connect ECONNREFUSED 127.0.0.1:6379` ao rodar o backend ou os testes | O Redis não está de pé. Suba com `docker compose up -d redis` (requer Docker rodando) ou, sem Docker, um `redis-server` local escutando em `6379` (`brew install redis && redis-server --daemonize yes` no macOS). `backend/test/global-setup.ts` já falha rápido com essa mesma orientação se os testes e2e não conseguirem conectar. |
| `EADDRINUSE` ao reiniciar o backend manualmente | `nest start --watch` sobe um processo filho que sobrevive a matar só o processo `npm` — mata pela porta, não pelo PID: `lsof -ti:3001 \| xargs kill -9`. É o mesmo cuidado que o script de captura de evidência (`evidencias/`) usa entre as duas execuções. |
| Testes unitários de `ProductsService` falhando com dados de uma execução anterior | Esses testes rodam contra Redis real, não fakes — se algo interromper a suíte no meio (`Ctrl+C`), o banco de teste (`redis://localhost:6379/1`, DB lógico separado do `0` usado por `start:dev`) pode ficar com chaves de uma reserva inacabada. `redis-cli -n 1 flushdb` limpa; rodar a suíte de novo também limpa sozinho (`beforeEach` já faz `flushdb`). |
| Estoque parece "errado" depois de várias execuções manuais seguidas | `product:stock:{productId}` é semeado só uma vez (`SET NX`) e só muda por venda confirmada — reiniciar o backend não reseta o catálogo para os valores originais do `erp-mock`, de propósito (ver [Catálogo](#catálogo-o-erp-é-o-dono-dos-dados-a-loja-só-lê) acima). Para voltar ao estado inicial (5/10/1), `redis-cli flushdb` antes de religar o backend. |

## Leitura complementar

- [`specs/spec.md`](specs/spec.md) — a especificação comportamental completa: histórias de usuário, decisões de implementação, modelo de dados, decisões de teste, lista de fora de escopo.
- [`specs/constitution.md`](specs/constitution.md) — governança do projeto: stack, diretrizes de código, arquitetura Controller/Service/Module, regras de teste.
- [`PROMPTS.md`](PROMPTS.md) — como a IA foi usada para construir este projeto.

> **Nota:** os documentos acima em `specs/` (spec-driven development — `spec.md`, `constitution.md`, além de `plan.md`/`tasks.md`) estão em inglês de propósito, diferente do restante do repositório. São documentos de processo, relidos por múltiplos subagentes de IA ao longo da execução — inglês tokeniza de forma mais eficiente e tende a produzir raciocínio mais consistente nesse uso. Os documentos voltados para quem avalia a entrega (este README, `PROMPTS.md`) ficam em português. Rationale completo em [`PROMPTS.md`, "Nota sobre o idioma dos documentos"](PROMPTS.md#nota-sobre-o-idioma-dos-documentos).
