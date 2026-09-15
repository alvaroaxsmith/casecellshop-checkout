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

## Skills, plugins e MCPs de agente utilizados

Além do workflow descrito acima, skills e plugins específicos do Claude Code moldaram como o trabalho foi estruturado e executado — não só o resultado, mas o processo que chegou lá:

| Skill / plugin | Onde apareceu neste projeto | Evidência no repositório |
|---|---|---|
| `superpowers:writing-plans` | Estrutura de `specs/plan.md` — cada tarefa com blocos `Files:`/`Interfaces:` e passos numerados `- [ ] Step N`, sem placeholders nem "implementar depois" | O próprio arquivo, ex. "Task 1: Backend scaffold..." em `specs/plan.md` |
| `superpowers:subagent-driven-development` | O ciclo descrito em ["Workflow de execução"](#workflow-de-execução-subagent-driven-development) acima — subagente implementador novo por tarefa (sem memória de outras tarefas), revisor independente, correção do achado real, revisão final de todo o branch | Referenciado explicitamente no cabeçalho de `specs/plan.md` ("REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development"); diretório de ledger `.superpowers/` (git-ignorado) |
| `superpowers:using-git-worktrees` | Cada linha de trabalho isolada — as seis tarefas originais, e depois toda a branch `redis` — rodou em `.worktrees/`, nunca direto na working tree principal | `.gitignore` (`/.worktrees/`); commit `fdd3dab chore: ignore .worktrees/ directory used for isolated implementation work` |
| `frontend-design` | Redesenho da UI do frontend em Tailwind — cards clicáveis no lugar de um `<select>`, tipografia e responsividade pensadas com intenção, não só "aplicar classes" | Commit `f206aee feat(frontend): redesign checkout UI with Tailwind and a layered structure` |
| `mattpocock-skills:to-spec` (parcial) | `specs/spec.md` segue a mesma forma do template do skill (problema → solução → user stories → decisões de implementação/teste → fora de escopo), sem a etapa de publicar num issue tracker | Nota explícita em `specs/spec.md`: "There is no issue tracker configured in this project (`/setup-matt-pocock-skills` was not run); this spec lives as a file in the repository instead of being published to an external tool" |

MCPs (Model Context Protocol) disponíveis no ambiente, e como foram (ou não) usados de fato:

- **Context7** — consultado para confirmar comportamento específico de versão de bibliotecas (NestJS, Vite/Vitest, Playwright) em vez de confiar só em conhecimento de treinamento, que pode estar desatualizado para a versão real instalada no projeto.
- **GitHub** — habilitado no ambiente para operações de repositório; a interação real com o Git neste projeto, porém, foi feita quase inteiramente via linha de comando (`git`), visível no histórico de commits regular deste repositório — o MCP ficou disponível como alternativa, não como caminho principal, já que não houve fluxo de Pull Request neste mini-projeto (push direto em `main`/`redis`).
- **Playwright (navegador)** — não é o que roda a suíte `e2e/`: aquela suíte usa o pacote `@playwright/test` real, executado via `npm test` dentro do pacote, como qualquer teste automatizado do projeto. O MCP de navegador fica disponível à parte, para inspeção visual pontual da UI durante o desenvolvimento — um passo de verificação manual, não algo que produz artefato versionado.

## Prompts mais relevantes (fase de refinamento pós-entrega)

A tabela abaixo reproduz, quase sempre ao pé da letra, os pedidos do usuário que mais mudaram o rumo do trabalho depois da entrega inicial — em especial os que corrigiram um caminho errado que a IA tinha tomado. Preservados porque mostram onde o julgamento humano foi decisivo, não só o resultado final:

| Prompt (literal) | O que mudou |
|---|---|
| "tirar a cobertura de testes/coverage que nao faz sentido para nao induzir falso/baixos resultados" | Interpretado errado à primeira leitura como "apagar o relatório de cobertura" — removido, depois revertido assim que o mal-entendido ficou claro |
| "na verdade era para comentar nos testes para remover os que estao abaixando a cobertura nao remover o relatorio de cobertura completo das evidencias" | Correção: o relatório volta; o alvo real eram testes/funções específicos puxando a cobertura pra baixo, não o documento inteiro |
| "é para remover ou comentar as funcoes que realmente nao fazem sentido existirem e estao abaixando a cobertura" | Rejeitou uma tentativa de excluir arquivos da cobertura via config do Jest (`coveragePathIgnorePatterns`) — reduzir o escopo medido não é o mesmo que fechar a lacuna de verdade |
| "nao faca comentarios no codigo" | Rejeitou comentários explicativos adicionados a `products.service.ts`/`orders.service.ts` para justificar cobertura baixa — a resposta certa era escrever testes de verdade, não documentar a ausência deles |
| "aumente a cobertura" (anotado na linha de cobertura do backend, selecionada direto no editor) | Disparou uma rodada focada especificamente na cobertura de testes unitários do backend (81.27% → 97.71%, 39 testes), sem tocar em código de produção |
| "a fim de deixar os titulos mais visiveis e organizados, enumere todo o readme com numeros e numeros romanos tambem, organize da forma que achar melhor" | Numeração completa do README (I–XI + sub-seções), com liberdade explícita de organização |
| "numero romano com numero comun ficou estranho, por exemplo IV.1, melhor IV.a" + "nao entendi tambem o VII.9 do nada" | Ajustou o esquema (letra em vez de número arábico nas sub-seções) e expôs a lista completa da seção VII no sumário — uma numeração que fazia sentido para quem escreveu, mas não para quem lê |
| "concerte as legendas" (acompanhado de um print da seção renderizada) | Uma legenda descrevia "topo"/"embaixo" quando o GitHub renderizou o diagrama lado a lado — corrigida a partir da evidência visual real, não da suposição de como o Mermaid ia layoutar |

## Nota sobre o idioma dos documentos

Os documentos de processo (`specs/*.md`) ficaram em inglês; os documentos voltados para quem avalia (`README.md`, este arquivo) ficaram em português. Além de ser o idioma de quem lê a entrega, inglês tokeniza de forma mais eficiente em modelos de linguagem (menos tokens por unidade de informação) e tende a produzir raciocínio mais consistente em tarefas de instrução estruturada — relevante aqui porque os documentos de spec são relidos por múltiplos subagentes ao longo da execução.
