# Fundamentals of Software Architecture — Trechos de Referência

- **Livro**: Fundamentals of Software Architecture: An Engineering Approach
- **Autores**: Mark Richards, Neal Ford
- **Editora**: O'Reilly, 2020 (1ª edição)

Trechos extraídos e usados como base para o [`Parte 1.A — Perguntas Conceituais.md`](../Parte%201.A%20—%20Perguntas%20Conceituais.md). Numeração de página conforme impressa no livro (não a página física do PDF).

---

## 1. As Leis da Arquitetura de Software (Capítulo 1, p. 19–20)

> "Everything in software architecture is a trade-off."
> — First Law of Software Architecture

> "If an architect thinks they have discovered something that isn't a trade-off, more likely they just haven't identified the trade-off yet."
> — Corollary 1

> "Why is more important than how."
> — Second Law of Software Architecture

**Usado em**: o [`Parte 1.A — Perguntas Conceituais.md`](../Parte%201.A%20—%20Perguntas%20Conceituais.md) atual não cita mais essas leis explicitamente — foi reescrito em linguagem simples, sem nomear livro ou padrão. Mas o espírito das duas leis continua presente: toda escolha técnica no documento vem com uma alternativa descartada e o motivo da escolha, nunca como "melhor prática" sem explicação. As oito decisões em [`decisoes-tecnicas.md`](decisoes-tecnicas.md) são a versão mais formal disso, onde a lógica das leis fica explícita em cada ADR (Contexto + Decisão + Consequências).

---

## 2. Analisando Trade-Offs (Capítulo 2, p. 30–33)

Exemplo central do capítulo: um sistema de leilão em que um `Bid Producer` precisa enviar lances para três serviços consumidores. O livro compara duas soluções — **tópico (pub-sub)** vs **filas ponto-a-ponto** — para mostrar que toda escolha técnica tem vantagens e desvantagens reais, nunca uma "resposta certa" isolada. As duas soluções são resumidas na **Table 2-1** (formato: coluna de vantagens, coluna de desvantagens).

> "Architecture is the stuff you can't Google."
> — Mark Richards

> "There are no right or wrong answers in architecture—only trade-offs."
> — Neal Ford

> "Programmers know the benefits of everything and the trade-offs of nothing. Architects need to understand both."
> — Rich Hickey (citado no livro)

**Usado em**: formato das tabelas de trade-off na Pergunta 1 do documento da Parte 1.A (coluna "Vantagem" / coluna "Desvantagem" para cada caminho, um por problema). As Perguntas 2 e 4 foram simplificadas e não têm mais tabela formal — a decisão e o motivo aparecem direto no texto —, mas o mesmo formato de comparação continua nas ADRs de [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 3. Architecture Decision Records (Capítulo 19, p. 285–291)

Estrutura básica de um ADR (Figure 19-1): **Title, Status, Context, Decision, Consequences**, com **Compliance** e **Notes** como seções adicionais recomendadas pelos autores.

- **Status**: `Proposed`, `Accepted` ou `Superseded` — um ADR superseded referencia o que o substituiu, mantendo o histórico de decisões rastreável (exemplo dado no livro: ADR 42 sendo superado pelo ADR 68).
- **Context**: responde "o que está me forçando a tomar essa decisão?" — descreve a situação e, quando fizer sentido, as alternativas consideradas.
- **Decision**: escrito em voz afirmativa ("we will use X"), não especulativa ("I think X would be best") — o objetivo é remover ambiguidade sobre se a decisão foi de fato tomada.
- **Consequences**: documenta o impacto (bom e ruim) e o trade-off por trás da decisão — é aqui que a análise de trade-off fica registrada de forma permanente.
- **Compliance**: como a conformidade com essa decisão será verificada — manual ou automatizada via *fitness function* (o livro dá um exemplo com um teste ArchUnit em Java).
- Prática adicional citada: usar um status `Request for Comments` com prazo definido, para evitar o anti-padrão de "discussão infinita sem decisão".

**Usado em**: formato das 8 ADRs em [`decisoes-tecnicas.md`](decisoes-tecnicas.md) (com uma extensão própria — campos **Premissa** e **Condição de reversão** — para deixar explícitas suposições não confirmadas pelo case). Esse conteúdo morava no Apêndice A do documento da Parte 1.A até a versão anterior; foi movido para cá quando o design doc foi simplificado, para manter as respostas da Parte 1.A diretas. O campo Compliance do ADR-001 cita diretamente o conceito de *fitness function* deste capítulo.

---

## 4. Analyzing Architecture Risk — Risk Matrix (Capítulo 20, p. 297–300)

**Risk Matrix** (Figure 20-1): risco = impacto (baixo=1, médio=2, alto=3) × probabilidade (baixo=1, médio=2, alto=3), resultando numa pontuação de 1 a 9, classificada por cor:

- 1–2 = baixo risco (verde)
- 3–4 = médio risco (amarelo)
- 6–9 = alto risco (vermelho)

**Risk Assessment** (Figure 20-2): tabela cruzando critérios de risco (ex. Scalability, Availability, Performance, Security, Data integrity) contra áreas/domínios do sistema, com total por critério e por área — permite comparar onde o risco está concentrado.

O livro também recomenda **filtrar** a matriz para mostrar só as áreas de alto risco em apresentações (Figure 20-3), e usar sinais **+ / -** ao lado da pontuação para indicar direção (melhorando/piorando) em vez de setas, que os autores relatam gerar interpretação ambígua entre leitores.

**Usado em**: matriz de risco "antes × depois da Fase 1" em [`decisoes-tecnicas.md`](decisoes-tecnicas.md) (antes vivia no Apêndice B do documento da Parte 1.A), incluindo a nota explícita de que os números ali são estimativa qualitativa própria, não medição real (não existe produção rodando ainda).

---

## 5. Diagramming and Presenting Architecture — Diagram Guidelines (Capítulo 21, p. 319–321)

Diretrizes de diagramação citadas:

- **Titles**: todo elemento do diagrama deve ter título ou ser inequivocamente identificável pela audiência.
- **Lines**: linhas devem ser grossas o suficiente para serem vistas; um dos poucos padrões que de fato existe na área é que **linha sólida = comunicação síncrona** e **linha tracejada = comunicação assíncrona**.
- **Shapes**: os autores usam caixas 3D para artefatos deployáveis e retângulos para containers — uma convenção própria deles, não um padrão universal, mas consistente.
- **Labels**: rotular cada item do diagrama sempre que houver qualquer chance de ambiguidade para quem lê.
- **Color**: usar cor para distinguir participantes/serviços diferentes entre si — não para distinguir múltiplas instâncias do mesmo componente.
- **Keys**: incluir uma legenda quando os símbolos usados não forem autoexplicativos ("nada é pior que um diagrama que leva a má interpretação, o que é pior que não ter diagrama").

**Usado em**: aplicado em todos os diagramas Mermaid (`flowchart` e `sequenceDiagram`) do documento da Parte 1.A — setas sólidas para chamadas síncronas, tracejadas para fluxos assíncronos. A versão simplificada do documento não descreve mais essa convenção em texto (o bloco "Convenção de diagramas" da Metodologia foi cortado), mas ela continua valendo nos diagramas em si.
