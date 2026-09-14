# CaseCellShop — Mini-Projeto de Checkout (Parte 1.B)

Uma fatia fullstack executável da jornada de checkout descrita em [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md): o cliente escolhe um produto e uma quantidade, tenta comprar, e o sistema garante que nunca vende além do estoque, nunca duplica um pedido em caso de retry/duplo clique, e sempre responde rápido mesmo quando o ERP do backend está lento ou instável.

O repositório contém três processos Node.js independentes — `erp-mock/`, `backend/`, `frontend/` — sem necessidade de Docker ou ferramenta de orquestração.

## Pré-requisitos

- Node.js 20 LTS
- npm

## Instalação e execução

Cada pacote é instalado e iniciado de forma independente, em seu próprio terminal, nesta ordem (o backend precisa que o `erp-mock` esteja acessível para processar um checkout em segundo plano, embora sua própria inicialização não dependa disso; o frontend precisa do backend para qualquer dado real).

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

Nenhum dos três serviços precisa de arquivo `.env` para rodar com os valores padrão. `PORT` muda a porta do `erp-mock`/`backend`; o backend também lê `ERP_MOCK_URL` (a URL da instância de `erp-mock` a ser chamada, padrão `http://localhost:4000`), e `ERP_SIM_MODE`/`ERP_SIM_DELAY_MS` (repassadas como headers para o `erp-mock` para forçar um comportamento simulado específico do ERP — `always-success`/`always-fail`/`always-timeout`/`random` — em vez do comportamento aleatório padrão). É assim que a suíte de testes e2e aponta o backend para uma instância de teste dedicada do `erp-mock` e conduz cada cenário de forma determinística; veja `backend/test/global-setup.ts` e `backend/src/erp/erp.service.ts`.

## Rodando os testes

**`erp-mock/`** (Jest + Supertest, executado diretamente contra o `app` do Express, sem precisar vincular porta):

```bash
cd erp-mock
npm test
```

**`backend/`** (Jest):

```bash
cd backend
npm test          # testes unitários (*.spec.ts) — regras de negócio de ProductsService e CheckoutService
npm run test:e2e  # testes end-to-end (*.e2e-spec.ts) — contrato HTTP completo, incl. concorrência e idempotência
```

`npm run test:e2e` sobe o `erp-mock` automaticamente como um processo filho antes da suíte rodar e o encerra depois (`test/global-setup.ts` / `test/global-teardown.ts`, que fazem polling em `GET /health` antes de liberar os testes) — você **não** precisa ter o `erp-mock` já rodando em outro terminal especificamente para esse comando. Ele ainda é necessário como processo separado para o `start:dev`/uso manual do próprio backend, e para o fluxo do frontend acima.

**`frontend/`** (Vitest + React Testing Library):

```bash
cd frontend
npm test
```

## Arquitetura e principais decisões técnicas

O raciocínio completo por trás de cada decisão abaixo está nos documentos do spec-kit do projeto, linkados ao final desta seção — este README os resume, não os substitui.

### Por que `erp-mock` é um serviço HTTP real separado, e não uma simulação in-process

O backend chama o `erp-mock` através de uma fronteira de rede real (HTTP, processo próprio, porta própria) em vez de simular o comportamento do ERP com uma classe in-process. Essa é uma escolha deliberada de gestão de risco, não incidental: uma simulação in-process não consegue exercitar os modos de falha que realmente importam para os critérios de resiliência deste case — reset de conexão, um timeout que de fato precisa correr contra o relógio (`Promise.race` perdendo, não apenas a função retornando um erro), uma resposta lenta competindo com o próprio event loop do backend. Um segundo processo real também é o que obriga o modo de simulação do `erp-mock` a ser **stateless e controlado por header**, em vez de configuração no lado do servidor: duas tentativas de checkout concorrentes na mesma execução de teste podem exigir comportamentos simulados diferentes (`always-success` vs. `always-timeout`) sem disputar um estado mutável compartilhado — exatamente a mesma garantia de isolamento que o design original tinha "de graça" ao ler `process.env` a cada chamada. Veja a nota de design da Task 2 em `specs/plan.md` para o argumento completo (a seção **Risk Management**, separada, do plano cobre uma preocupação diferente e mais restrita: o que acontece operacionalmente se o processo de teste do `erp-mock` falhar ao iniciar).

O `erp-mock` continua sendo um serviço Express simples, em vez de uma segunda aplicação NestJS (veja `specs/constitution.md`, "Stack and Technologies") — é um dublê de teste representando um sistema fora do controle deste projeto, não parte do produto sendo construído.

### Arquitetura do backend: Controller/Service/Module achatado, sem DDD

O backend é uma estrutura NestJS direta — um `Controller`, um `Service`, um `Module` por assunto (`products/`, `orders/`, `idempotency/`, `erp/`, `checkout/`), sem camadas separadas de domain/application/infrastructure. Essa foi uma escolha deliberada, feita explicitamente (veja `specs/constitution.md`, "Architecture and Clean Code", e seu changelog): uma separação tática de Domain-Driven Design — entidades com métodos que garantem seus próprios invariantes, ports/adapters de repositório, uma camada de aplicação com use case — chegou a ser implementada e totalmente revisada primeiro, e então foi julgada como mais cerimônia do que o escopo de um mini-projeto de três endpoints justifica. A indireção extra (uma interface para cada repositório, uma classe de entidade separada para cada conceito, uma camada de use case sobre os serviços que ela orquestra) é o tipo de overhead que se paga em uma base de código grande e de vida longa, e não aqui; quem revisa ou avalia este código deve conseguir achar `if (available < quantity)` em um salto, não navegar por várias camadas de abstração até chegar lá.

O que continua valendo é a *disciplina de nomenclatura* do DDD, mantida deliberadamente: métodos e variáveis usam o vocabulário real do negócio (`reserveStock`, `settleWithErp`, `idempotencyKey`) em vez de nomenclatura CRUD genérica. Cada `Controller` continua fazendo apenas roteamento — nenhuma regra de negócio, nenhum mapeamento de erro para status (isso é centralizado uma única vez, no `HttpExceptionFilter` global) — e cada `Service` continua sendo dono tanto da lógica de negócio quanto dos dados sobre os quais ela opera, em um só lugar. `ProductsService` combina o catálogo de produtos e a reserva de estoque pelo mesmo motivo que a versão DDD anterior os combinava: `GET /products` precisa dos dois, e dividi-los em dois serviços que dependem um do outro seria uma dependência circular sem benefício nesta escala.

### Armazenamento em memória em vez de Redis

As ADR-002 e ADR-003 de `referencias/decisoes-tecnicas.md` descrevem o Redis (um script Lua para reserva de estoque, um cache indexado para idempotência) como o design real da Fase 1 de produção. Este mini-projeto simplifica os dois para um único `Map` em memória por assunto, e essa simplificação preserva a garantia de correção que realmente importa, não só um footprint menor: o script Lua do Redis garante que a operação de verificar-e-decrementar estoque rode como um passo indivisível porque o Redis a processa sem interrupção de outro cliente. Um processo Node.js dá a garantia equivalente de graça, desde que o código de verificar-e-decrementar permaneça totalmente síncrono (sem `await` entre checar disponibilidade e reservar) dentro de um serviço singleton — o event loop do JavaScript nunca pode intercalar duas chamadas à mesma função síncrona, então duas requisições concorrentes para a última unidade nunca podem ambas "passar" na verificação. Essa equivalência está detalhada na decisão "Storage" de `specs/spec.md`, e o teste e2e de concorrência do backend (disparando várias tentativas de checkout simultâneas contra um produto com 1 unidade em estoque) é a garantia de regressão para isso.

### Por que a idempotência só armazena em cache a resposta de sucesso

Uma requisição `POST /checkout` que falha na validação, ou aponta para um produto inexistente, ou esbarra em estoque insuficiente, é uma **função pura** da entrada e do nível de estoque atuais — reenviar exatamente a mesma requisição recalcula exatamente a mesma resposta, sem efeito colateral para repetir acidentalmente. A única resposta que não é pura é o sucesso `202 pending`, porque ela tem um efeito colateral: cria um pedido e reserva estoque. Esse é o único caminho que realmente precisa ser lembrado em relação à `Idempotency-Key` — reenviar a mesma chave retorna o pedido *original* em vez de criar um segundo e reservar estoque em dobro. Veja a decisão "Idempotency" de `specs/spec.md` e a ADR-003 em `referencias/decisoes-tecnicas.md` (este mini-projeto mantém a ideia de "guardar a chave em cache" dessa ADR, mas descarta seu TTL de 24h, já que não há persistência real a proteger em um processo de demonstração de vida curta).

### Fora de escopo

Copiado da seção "Out of Scope" de `specs/spec.md`:

- **Autenticação, pagamento real, deploy em nuvem, Docker obrigatório** — explicitamente excluídos pelo próprio case.
- **Carrinho com múltiplos itens** (ADR-007) — o checkout continua single-item (`productId` + `quantity`) porque o case descreve a jornada de compra sempre no singular, e nenhum dos critérios avaliados (consistência de estoque, idempotência, concorrência, contrato de erro) depende de um carrinho; adicionar um transformaria a reserva indivisível de um único produto em um problema de write-skew multi-objeto, exigindo um redesign, não uma extensão.
- **Fila durável (RabbitMQ/BullMQ), um banco Postgres dedicado, CDC** — pertencem às Fases 2/3 do plano incremental de produção (veja `Parte 1.A — Perguntas Conceituais.md`, Pergunta 2), não a este mini-projeto de código.
- **Um cron de reconciliação automatizado de verdade** (ADR-008) rodando como um processo agendado real — documentado aqui como próximo passo; `GET /orders/:id` já cobre a necessidade imediata do cliente (e de um avaliador) de ver o status atual de um pedido.
- **Testes de contrato formais (Pact) e testes de carga** — já documentados na Pergunta 5 da Parte 1.A como próximo passo, não uma prioridade para esta entrega.
- **Um layout de UI caprichado** — o case explicitamente não espera isso.

## Contrato da API (resumo)

- `GET /products` — lista o catálogo semeado com o estoque *disponível* de cada produto (estoque base menos reservas ativas).
- `POST /checkout` — corpo `{ productId, quantity, idempotencyKey }` (a chave também pode ser enviada como o header `Idempotency-Key`). Retorna `202` com `{ orderId, status: "pending", statusUrl }` em caso de sucesso; `400 VALIDATION_ERROR`, `404 PRODUCT_NOT_FOUND`, ou `409 OUT_OF_STOCK` em caso de falha.
- `GET /orders/:id` — status atual do pedido (`pending` | `confirmed` | `failed`, com `error: { code, message }` quando `failed`); `404 ORDER_NOT_FOUND` para um id desconhecido.

O contrato exato, incluindo cada campo e código de status, está definido na Pergunta 4 de `Parte 1.A — Perguntas Conceituais.md` e reafirmado com precisão na decisão "`POST /checkout`" de `specs/spec.md`.

## Leitura complementar

- [`specs/spec.md`](specs/spec.md) — a especificação comportamental completa: histórias de usuário, decisões de implementação, modelo de dados, decisões de teste, lista de fora de escopo.
- [`specs/constitution.md`](specs/constitution.md) — governança do projeto: stack, diretrizes de código, arquitetura Controller/Service/Module, regras de teste.
- [`specs/plan.md`](specs/plan.md) — o plano de implementação tarefa a tarefa (nota: descreve a versão em DDD do backend, que foi substituída pela arquitetura achatada atual — veja o histórico do git para o raciocínio completo dessa mudança); inclui a nota de design da Task 2 da qual vem o raciocínio sobre o `erp-mock` deste README.
- [`Parte 1.A — Perguntas Conceituais.md`](Parte%201.A%20—%20Perguntas%20Conceituais.md) — o documento de design conceitual do qual este código implementa uma fatia (diagnóstico, arquitetura-alvo, raciocínio de concorrência/idempotência, contrato de API, estratégia de teste, uso de IA).
- [`referencias/decisoes-tecnicas.md`](referencias/decisoes-tecnicas.md) — as ADRs (ADR-001 a ADR-008) e a matriz de risco antes/depois que embasam as respostas conceituais.
- [`PROMPTS.md`](PROMPTS.md) — como a IA foi usada para construir este projeto.
