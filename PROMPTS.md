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
