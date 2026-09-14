# PROMPTS.md — Como a IA foi usada para construir este projeto

Este documento registra como a IA foi usada para construir o mini-projeto de checkout da CaseCellShop (Parte 1.B), conforme a Pergunta 6 de `Parte 1.A — Perguntas Conceituais.md` e o próprio item do checklist do case que pede esse registro. Não é uma transcrição — o projeto não foi construído como uma única conversa contínua de ida e volta. Ele foi construído através de duas estratégias combinadas: **spec-driven development** (constituição → spec → plano → tarefas, cada documento derivado do anterior e servindo de fonte da verdade para o próximo) e, para a execução do código, um workflow de **subagent-driven development** — uma sessão controladora que nunca escreveu código de aplicação diretamente, despachando um subagente implementador novo por tarefa, seguido de um subagente revisor independente e um ciclo de correção, com cada achado e decisão registrados em um ledger (`.superpowers/sdd/plan/progress.md`) no momento em que aconteceram. Este arquivo resume esse workflow e a substância do que foi despachado e encontrado, tarefa por tarefa; o detalhe completo (cada achado, cada hash de commit) vive nesse ledger para quem quiser auditar o processo em si.

## Estratégia de spec-driven development

Antes de qualquer código, a base de documentação foi construída em camadas, cada uma derivando da anterior e funcionando como autoridade para a próxima — o objetivo é que nenhuma decisão de implementação fique só na cabeça de quem escreveu o código:

1. **Constituição** (`specs/constitution.md`) — o documento de governança, escrito primeiro: escolhas de stack, diretrizes de código, regras de arquitetura, regras de teste, segurança, convenções de git. Qualquer decisão posterior que conflite com ela precisa ser corrigida ou se tornar uma emenda explícita e registrada — nunca uma exceção silenciosa. Foi emendada uma vez durante o projeto (veja "Mudança de arquitetura" abaixo).
2. **Spec** (`specs/spec.md`) — a especificação comportamental deste mini-projeto, derivada das respostas conceituais em `Parte 1.A — Perguntas Conceituais.md` e das ADRs em `referencias/decisoes-tecnicas.md`: histórias de usuário, decisões de implementação (armazenamento, idempotência, fluxo de checkout), modelo de dados, decisões de teste e uma lista explícita de itens fora de escopo. Gerada inicialmente com a skill `to-spec`, sintetizando o contexto já estabelecido em vez de reentrevistar o usuário do zero.
3. **Plano** (`specs/plan.md`) — um plano de implementação tarefa a tarefa derivado da spec, incluindo uma varredura de consistência entre tarefas antes de qualquer código ser escrito (checando se o que uma tarefa produz é exatamente o que uma tarefa posterior consome) e uma tabela de gestão de risco específica para esta implementação. Gerado com a skill `writing-plans`.
4. **Checklist de tarefas** (`specs/tasks.md`) — espelha o plano em formato de checklist Markdown, com um estado de três valores (pendente / em progresso / concluído) para acompanhar o progresso e permitir retomar o trabalho entre sessões sem perder o lugar.
5. **Execução**, tarefa por tarefa, usando a skill `subagent-driven-development` (detalhada na próxima seção).

Antes de a spec ser escrita, o problema em si (concorrência, idempotência, resiliência a falhas do ERP) já havia sido explorado em profundidade na Parte 1.A, incluindo sessões de "grilling" (entrevista adversarial guiada por IA) para forçar decisões explícitas sobre números de TTL, escopo do carrinho, e o que ficaria fora do escopo da Fase 1 — nada disso foi assumido silenciosamente.

## Workflow de execução por tarefa (subagent-driven development)

Cada tarefa do plano passou pelo mesmo ciclo:

- Despachar um **subagente implementador novo** com apenas o brief daquela tarefa — sem memória de outras tarefas, forçando o brief a carregar todo o contexto necessário.
- O controlador faz uma **checagem pontual** do diff (consistência do `package-lock.json`, estrutura de arquivos) antes da revisão.
- Despachar um **subagente revisor independente** contra o brief da tarefa e a spec/constituição do projeto, checando tanto "está de acordo com a spec" quanto "a qualidade da tarefa é aceitável" (bugs, violações de arquitetura, uso de `any`, código morto).
- Os achados são triados: defeitos reais voltam para o **mesmo implementador** (ou um novo, se a sessão original não estiver mais acessível) para uma rodada de correção; achados que se revelam falsos positivos, ou que remontam a um defeito no próprio código de referência do plano em vez do trabalho do implementador, recebem uma decisão explícita e registrada — nunca são descartados silenciosamente.
- Uma **re-revisão** confirma que cada correção realmente resolveu o achado sem introduzir quebras novas antes de a tarefa ser marcada como concluída.
- Ao final de todas as tarefas, uma **revisão final de todo o branch** (no modelo mais capaz disponível) procura por problemas que só aparecem olhando o branch inteiro — inconsistências entre tarefas, lacunas de integração que nenhuma revisão isolada conseguiria ver.

A justificativa para delegar código repetitivo, testes e documentação à IA, mantendo arquitetura, design de estoque/reserva/idempotência e lógica de concorrência sob decisão humana direta, está detalhada na Pergunta 6 de `Parte 1.A — Perguntas Conceituais.md`; a separação controlador/revisor deste projeto é o mecanismo concreto que impõe "verificar, não apenas aceitar" exatamente nessas áreas de alto risco — a garantia de concorrência e o cache de idempotência foram re-derivados e checados de forma independente por um subagente revisor na Task 3, não apenas implementados uma vez e aceitos por confiança.

## Resumo por tarefa

### Varredura pré-execução

Antes de despachar a Task 1, o controlador cruzou cada par produtor/consumidor de interface entre as seis tarefas de `specs/plan.md` (ex.: a `CheckoutUseCase` da Task 3 consome exatamente o que a `StockService` da Task 1 produz?) e encontrou uma linha desatualizada: a lista de arquivos da Task 3 sugeria indevidamente que `http-exception.filter.ts` precisaria ser editado, quando a Task 1 já escrevia sua forma final. Corrigido diretamente no plano antes de qualquer implementador vê-lo.

### Task 1 — Scaffold do backend, domínio de Inventory, `GET /products`

Despachado: scaffold do backend NestJS, o bounded context de Inventory (entidade `Product`, serviço de domínio `StockService`, repositórios em memória) e `GET /products`, tudo em camadas DDD conforme a constituição vigente na época.

- O implementador esbarrou em uma falha real de compilação com o `import request from "supertest"` especificado no brief e contornou localmente; a investigação rastreou a causa real a um defeito do plano (`tsconfig.json` tinha `allowSyntheticDefaultImports` mas não `esModuleInterop`) — corrigido tanto no código quanto no plano, e o contorno do implementador foi revertido em favor do import original (agora correto).
- A revisão encontrou um defeito real (`package-lock.json` não batia com o `package.json` commitado, o que quebraria `npm ci`) — corrigido regenerando o lockfile.
- A revisão também sinalizou `StockService` importando `@Injectable`/`@Inject` de `@nestjs/common` dentro de `domain/` como possível violação de "sem imports de framework na camada de domínio". Decisão: não era um defeito real — a regra de fato da constituição proibia imports de tipos HTTP/transporte na camada de domínio, não decorators de injeção de dependência do NestJS, que não carregam nenhuma preocupação de transporte — o checklist do revisor havia sido formulado de forma mais estrita do que a regra original.
- Adicionado um `.gitignore` que faltava na raiz (`node_modules/`, `dist/`, `.env*`) como correção de higiene, sem relação com código funcional.

### Task 2 — Serviço de ERP mockado (`erp-mock/`)

Despachado: um serviço Express independente simulando o ERP como uma dependência HTTP externa real, com comportamento controlado por header por requisição (`always-success`/`always-fail`/`always-timeout`/`random`, delay configurável) para que os testes possam forçar comportamento determinístico do ERP sem estado no lado do servidor que pudesse vazar entre requisições concorrentes.

- Implementação limpa; o implementador checou explicitamente a consistência do package-lock desta vez, evitando repetir a mesma classe de bug da Task 1.
- Revisão aprovada com dois achados menores adiados, ambos remontando ao próprio código de referência do plano, não a um desvio do implementador (uma asserção de tipo sem checagem no header de modo de simulação, que cai inofensivamente no ramo aleatório em caso de entrada inválida, e um `exclude` faltando no `tsconfig` que deixa o `tsc` compilar também o arquivo de teste para dentro de `dist/`).

### Task 3 — Núcleo do checkout (`POST /checkout`, `GET /orders/:id`)

A tarefa de maior risco: reserva de estoque, idempotência e resiliência do ERP vivem aqui. Despachada como uma única tarefa em vez de dividida, já que um revisor não conseguiria aprovar de forma significativa "checkout aceita entrada válida" enquanto rejeita "checkout rejeita entrada inválida" para o contrato de um único endpoint.

- O implementador reportou um aviso não determinístico de "worker" do Jest não saindo graciosamente em alguns runs de e2e, investigou e atribuiu a sockets keep-alive do pool de conexões do `undici`, não a um vazamento real de recurso.
- A revisão encontrou um defeito **crítico**, remontando ao próprio código de referência do plano: a chamada de ERP em segundo plano do `CheckoutUseCase` usava `Promise.race` sem nenhum `try`/`catch` ao redor da chamada de rede — qualquer rejeição no nível de transporte (reset de conexão, erp-mock fora do ar) viraria uma unhandled promise rejection e derrubaria o processo Node sob as configurações padrão do Node 20, e também zeraria silenciosamente o orçamento de retentativas para a classe de falha mais provável no mundo real. Isso era invisível para a suíte de testes existente porque `global-setup.ts` garante que o `erp-mock` está saudável antes de cada teste rodar.
- A revisão também encontrou uma violação **importante** de estilo: quatro casts `as any` no arquivo de teste unitário, desnecessários já que os objetos literais de teste já satisfaziam a forma real (parcialmente opcional) do DTO — violando a proibição geral de `any` da constituição.
- As duas correções foram aplicadas primeiro ao código de referência do plano e depois à implementação de fato commitada: a chamada ao ERP foi envolvida em `try`/`catch` (uma rejeição agora conta como uma tentativa falha, preservando o orçamento de retentativas), adicionado um `.catch()` defensivo na chamada de segundo plano "fire-and-forget", adicionada uma checagem de status de resposta no gateway HTTP antes de parsear o JSON, e removidos os casts `any`.
- A re-revisão confirmou as duas correções sem quebras novas. Vários achados menores foram adiados para uma passada final sobre o branch inteiro (nenhum `AbortController` de fato cancelando o fetch em andamento no timeout, crescimento sem limite do `Map` em memória aceito como limitação explícita de escopo de demonstração, casos de borda na lógica de matar o processo no teardown do teste, e alguns pequenos incômodos arquiteturais) — nenhum bloqueante, todos registrados.

### Task 4 — Scaffold do frontend e lista de produtos

Despachado: scaffold Vite + React + TypeScript e a tela inicial de lista de produtos (sem Next.js, conforme a constituição).

- Implementação limpa e revisão limpa — zero achados, a única tarefa do projeto que fechou sem uma rodada de correção.

### Task 5 — Fluxo de checkout do frontend

Despachado: o botão de compra, o input de quantidade, os estados de carregamento/status/erro, e o polling de `GET /orders/:id`.

- O implementador mudou várias das asserções de teste `getByRole(...)` do brief para `getAllByRole(...)[index]`, atribuindo isso ao duplo-render do React Strict Mode. A revisão verificou que esse diagnóstico estava **incorreto**: a causa real era que `frontend/test/setup.ts` nunca chamava o `cleanup()` do React Testing Library entre os testes, então nós do DOM de testes anteriores no mesmo arquivo se acumulavam — o contorno passava só porque toda instância obsoleta montada se comportava de forma idêntica sob os mesmos mocks, não porque o teste de fato exercitava a instância única pretendida.
- A correção correta, dentro do escopo (adicionar `afterEach(cleanup)` ao arquivo de teste, que o brief já autorizava editar) foi aplicada por um implementador recém-despachado, já que a sessão do implementador original não estava mais acessível para um follow-up direto. As cinco asserções foram revertidas para a forma singular original `getByRole` do brief assim que a causa real foi corrigida.
- A re-revisão confirmou a correção e confirmou que a mudança ficou restrita apenas ao arquivo de teste.

### Task 6 — README e PROMPTS.md

Apenas documentação, sem código de aplicação. Escritos o `README.md` (instruções de instalação/execução/teste para os três pacotes, e o raciocínio por trás das decisões de `erp-mock` como serviço real, camadas DDD, armazenamento em memória e cache de idempotência, extraído de `specs/spec.md`, `specs/constitution.md` e `specs/plan.md`) e este arquivo, extraído do ledger `.superpowers/sdd/plan/progress.md` em vez de reconstruído de memória.

### Revisão final de todo o branch

Com as seis tarefas completas, uma revisão final no modelo mais capaz disponível releu a spec, a constituição, o plano e o ledger completo, releu cada arquivo de código e teste do zero, rodou as quatro suítes de teste juntas (algo que nenhuma revisão de tarefa isolada havia feito) e comparou o branch inteiro contra o comportamento prometido pela spec.

- Confirmou, de ponta a ponta, as duas garantias que o case de fato avalia — nunca vender além do estoque, nunca duplicar um pedido em retry — corretas por construção.
- Encontrou um achado **importante** real que nenhuma revisão de tarefa isolada poderia ter visto: `ProductsService.confirmReservation` deduzia o estoque base *antes* de checar se a reserva ainda estava ativa, então uma segunda chamada à mesma reserva (por exemplo, de um futuro cron de reconciliação) deduziria o estoque duas vezes. Corrigido adicionando a checagem de status antes da dedução, com um teste unitário novo travando o comportamento.
- Encontrou uma lacuna real de resiliência no frontend: uma chamada `fetch` rejeitada (backend fora do ar, rede offline) deixava a UI presa permanentemente em estado de carregamento, com o botão de compra desabilitado para sempre — nenhum teste pegava isso porque todo teste mocka a API com uma resposta que resolve. Corrigido junto com uma extração da lógica de fetch/checkout para hooks dedicados (`useProducts`, `useCheckout`), conforme a constituição já pedia.
- Encontrou lacunas de ferramental de projeto que nenhuma tarefa individual tinha como prever, porque nenhum passo do plano as pedia: faltavam `.nvmrc`, o campo `packageManager` no `package.json`, as flags `noUncheckedIndexedAccess`/`noImplicitOverride` do TypeScript (mandatadas pela constituição), e configuração de ESLint/Prettier nos três pacotes.
- Encontrou duas imprecisões de documentação (uma afirmação factualmente errada sobre variáveis de ambiente no README, uma citação apontando para a seção errada do plano).
- Todos os achados relevantes foram corrigidos em uma única rodada de correção seguida de uma re-revisão focada, conforme o processo já estabelecido nas tarefas individuais.

## Mudança de arquitetura: de DDD para uma estrutura achatada

Depois que a implementação em Domain-Driven Design foi totalmente construída, revisada e aprovada (com ajustes) pela revisão final, o usuário pediu explicitamente uma reescrita para algo mais simples e claro, sem DDD — julgando, com razão, que a separação tática completa (entidades com métodos de invariante, interfaces de repositório e adapters, uma camada de use case) era cerimônia desproporcional para um mini-projeto de três endpoints. A constituição foi emendada primeiro (ela é a autoridade do projeto — nenhuma mudança de arquitetura acontece sem que ela seja corrigida junto), e o backend foi reescrito diretamente pelo controlador (sem reabrir o ciclo completo de subagentes, já que se tratava essencialmente de um refactor estrutural de código já correto e testado) para uma estrutura achatada — um `Controller`, um `Service`, um `Module` por assunto — preservando cada correção encontrada durante o ciclo de revisão da versão em DDD (a seção anterior lista todas elas). O contrato HTTP não mudou em nada, então nenhum teste e2e, nem o frontend, precisou de qualquer alteração — apenas os dois arquivos de teste unitário foram reescritos para os novos nomes de serviço achatados. Reverificado: 8/8 testes unitários do backend, 10/10 testes e2e do backend, 6/6 testes do `erp-mock`, 6/6 testes do frontend, todos passando; `tsc --noEmit` limpo nos três pacotes.
