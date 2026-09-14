# PROMPTS.md — Como a IA foi usada para construir este projeto

Registro de como a IA foi usada no mini-projeto de checkout da CaseCellShop (Parte 1.B), conforme pede a Pergunta 6 de `Parte 1.A — Perguntas Conceituais.md` e o checklist do case. Não é uma transcrição de conversa — o projeto foi construído em duas etapas: **spec-driven development** para a base (constituição → spec → plano → tarefas), e um workflow de **subagent-driven development** para a execução das seis tarefas iniciais (controlador + implementador + revisor independente por tarefa).

## Estratégia de spec-driven development

Antes de qualquer código, a documentação foi construída em camadas, cada uma servindo de autoridade para a próxima — para nenhuma decisão de implementação ficar só na cabeça de quem escreveu o código:

1. **Constituição** (`specs/constitution.md`) — stack, arquitetura, regras de teste e de código. Qualquer decisão posterior que conflite com ela vira uma emenda explícita e registrada, nunca uma exceção silenciosa.
2. **Spec** (`specs/spec.md`) — histórias de usuário, decisões de implementação, modelo de dados, decisões de teste e fora de escopo, derivados de `Parte 1.A` e das ADRs de `referencias/decisoes-tecnicas.md`.
3. **Plano** (`specs/plan.md`) — implementação tarefa a tarefa, com uma varredura de consistência entre tarefas antes de qualquer código ser escrito.
4. **Checklist** (`specs/tasks.md`) — o plano em formato de checklist, para acompanhar progresso entre sessões.
5. **Execução**, tarefa por tarefa (ver abaixo).

## Workflow de execução (subagent-driven development)

Cada tarefa passou pelo mesmo ciclo: um subagente implementador novo (só o brief da tarefa, sem memória de outras tarefas) → checagem pontual do controlador → um subagente revisor independente (contra a spec e a constituição, checando corretude *e* qualidade) → correção do achado real → re-revisão confirmando a correção. Ao final das seis tarefas, uma revisão final de todo o branch (no modelo mais capaz disponível) procurou problemas que só aparecem olhando o conjunto — o tipo de coisa que nenhuma revisão isolada por tarefa consegue ver.

## Resumo por tarefa

| Tarefa | O que foi entregue | Achado mais relevante |
|---|---|---|
| 1 — Backend scaffold + catálogo/estoque | NestJS, `GET /products` | `package-lock.json` fora de sincronia com `package.json` (quebraria `npm ci`); corrigido regenerando o lockfile. |
| 2 — `erp-mock` | Serviço Express, comportamento controlado por header por requisição | Implementação limpa, sem achados bloqueantes. |
| 3 — Núcleo do checkout | `POST /checkout`, `GET /orders/:id`, reserva de estoque, idempotência | **Crítico**: a chamada ao ERP em segundo plano não tinha `try/catch` — uma rejeição de rede virava unhandled rejection e derrubava o processo. Corrigido. |
| 4 — Frontend scaffold | Vite + React, lista de produtos | Única tarefa sem nenhum achado na revisão. |
| 5 — Fluxo de checkout (frontend) | Botão, loading, polling de status | O implementador diagnosticou um teste instável como "React Strict Mode" e contornou com `getAllByRole`; a causa real era falta de `afterEach(cleanup)` no setup dos testes. Corrigido na causa, contorno revertido. |
| 6 — README e PROMPTS.md | Documentação inicial | — |
| Revisão final do branch | Releitura completa + as 4 suítes de teste juntas | **Importante**: `confirmReservation` debitava o estoque antes de checar se a reserva ainda estava ativa — uma segunda chamada duplicaria o débito. Corrigido com teste de regressão. |

## Mudança de arquitetura: de DDD para uma estrutura achatada

Depois da implementação em Domain-Driven Design (entidades, repositórios, use cases) totalmente construída, revisada e aprovada, o usuário pediu uma reescrita mais simples — a separação tática completa era cerimônia desproporcional para um mini-projeto de três endpoints. A constituição foi emendada primeiro (é a autoridade do projeto), e o backend foi reescrito para `Controller`/`Service`/`Module` por assunto, preservando todas as correções encontradas na versão em DDD. O contrato HTTP não mudou — nenhum teste e2e nem o frontend precisou de alteração. `specs/plan.md` foi mantido como registro histórico do desenho original (ver a nota de amendment no topo do arquivo), em vez de reescrito por inteiro.

## Depois da entrega inicial

Pedidos pontuais subsequentes (suíte e2e com Playwright, redesenho do frontend com Tailwind e estrutura em camadas, catálogo vindo do `erp-mock`, logs estruturados, documentação Swagger, limpeza das specs) foram atendidos diretamente pelo controlador, sem reabrir o ciclo completo de subagentes — cada um era uma mudança incremental e pontual sobre código já testado, não uma tarefa nova de escopo comparável às seis originais. Cada um foi verificado rodando as suítes de teste relevantes antes de ser dado como concluído.

## Nota sobre o idioma dos documentos

Os documentos de processo (`specs/*.md`) ficaram em inglês; os documentos voltados para quem avalia (`README.md`, este arquivo) ficaram em português. Além de ser o idioma de quem lê a entrega, inglês tokeniza de forma mais eficiente em modelos de linguagem (menos tokens por unidade de informação) e tende a produzir raciocínio mais consistente em tarefas de instrução estruturada — relevante aqui porque os documentos de spec são relidos por múltiplos subagentes ao longo da execução.

## Histórico desta branch (`redis`)

O usuário tinha dúvida se a versão em memória de `main` demonstrava maturidade suficiente para a resolucao do case, e pediu uma sessão de `/mattpocock-skills:grill-me` para se orientar antes de decidir qualquer coisa. Em vez de assumir, a IA foi checar o PDF oficial do case — ele permite explicitamente "dados em memória ou banco local" e não pede Redis/fila; os critérios de avaliação pesam em trade-offs, arquitetura incremental e corretude de estoque/idempotência/concorrência, não em infraestrutura. Esse achado foi levado ao usuário antes de qualquer decisão.

Mesmo assim, o usuário decidiu materializar a Fase 1 (só Redis — ADR-001/002/003 de `referencias/decisoes-tecnicas.md`) como código real numa branch separada, para provar essas garantias contra infraestrutura de verdade em vez de só texto, explicitamente sem fila nem Postgres (isso ficaria para uma eventual branch `redis-queue`, só planejada, não construída). O plano técnico (esquema de chaves Redis, os três scripts Lua, a decisão de semear estoque com `SET NX` em vez de sobrescrever a cada refresh do cache-aside) foi desenhado e aprovado via plan mode antes de qualquer linha de código, e implementado diretamente pelo controlador (sem o ciclo de subagentes — mudança sequencial e fortemente acoplada num único módulo, onde subagentes isolados custariam mais do que ajudariam).

Um achado ao longo do caminho, adjudicado e documentado em vez de silenciosamente corrigido: a atomicidade do `SET ... NX` na chave de idempotência, por si só, **não** fecha a janela de corrida entre checar a chave e criar o pedido (dois checkouts concorrentes com a mesma `Idempotency-Key` ainda podem ambos passar pela checagem antes de qualquer um gravar) — fechar essa janela de verdade exigiria reivindicar a chave antes de criar o pedido, o que muda o contrato de resposta para o caso de corrida e ficou fora do escopo desta branch (Fase 1 = trocar a infraestrutura, mantendo o mesmo comportamento observável de `main`). Registrado para não ser vendido como uma correção que não existe.

Depois da implementação, o usuário pediu para validar tudo com Redis de verdade e documentar o processo, usando como referência de estilo o README de um projeto anterior dele ([`quickstart-crawler`](https://github.com/alvaroaxsmith/quickstart-crawler)) — resultados de execução real e datados em vez de só descrição, tabela de erros/troubleshooting, esquema de chaves explícito. A validação rodou o backend duas vezes contra Redis e `erp-mock` reais (uma com `ERP_SIM_MODE=always-success`, outra com `always-fail`), cobrindo oito cenários incluindo os dois que só esta branch tem: matar o processo (`kill -9`) e religar, confirmando que pedido e estoque sobrevivem; e uma reserva expirando sozinha por TTL nativo do Redis. Um erro real apareceu na primeira tentativa de captura: o cenário de falha do ERP usava um header `X-Erp-Simulate-Mode` que o backend simplesmente não lê (só `erp-mock` lê esse header, vindo do `ErpService`, que por sua vez lê a variável de ambiente `ERP_SIM_MODE` do próprio processo — não algo que dê pra mudar por requisição via curl); o cenário "de falha" passou por sorte (modo `random`, ~80% de chance de sucesso) sem nunca testar falha nenhuma. Corrigido reiniciando o backend com a env var certa, como a captura de `main` já fazia. Resultado em [`evidencias/logs-redis.md`](evidencias/logs-redis.md).
