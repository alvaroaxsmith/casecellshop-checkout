# Decisões Técnicas Detalhadas — ADRs e Matriz de Risco

Este arquivo guarda a camada mais formal de análise que sustenta as respostas do case tecnico parte 1.A — registro de decisão por decisão (ADR) e uma matriz de risco antes/depois — para quem quiser entender o raciocínio completo por trás de cada escolha, incluindo as suposições que fiz e o que me faria decidir diferente.

Formato de cada ADR: **Título, Status, Contexto, Decisão, Consequências, Compliance** — mais **Premissa** e **Condição de reversão** (ver [`fundamentals-of-software-architecture.md`](fundamentals-of-software-architecture.md), seção 3).

---

## ADRs

### ADR-001. Usar cache-aside (Redis) em vez de catálogo próprio na Fase 1

- **Status**: Aceito
- **Contexto**: a vitrine precisa parar de bater no ERP a cada requisição o quanto antes; o caminho mais robusto (catálogo próprio sincronizado) exige pipeline de sync/CDC, que não cabe com segurança em 30 dias.
- **Premissa (não verificada)**: estou assumindo que dá para provisionar um Redis no datacenter atual sem barreira de aprovação/infraestrutura dentro do prazo de 30 dias. O case diz apenas "datacenter próprio, com intenção de evoluir para serviços mais escaláveis" — não confirma que Redis (ou algo equivalente) já está disponível ou pode ser provisionado rapidamente.
- **Decisão**: dado isso, usarei cache-aside com Redis (TTL ~30s) na frente da leitura existente do ERP, adiando o catálogo próprio para a Fase 3.
- **Condição que reverteria esta decisão**: se provisionar Redis levar mais tempo que o esperado, a Fase 1 teria que recuar para um cache in-memory dentro do próprio processo Node (mais simples, mas sem compartilhamento entre múltiplas instâncias da API).
- **Consequências**: ganho de performance quase imediato, com custo de dado potencialmente desatualizado por até 30s — aceitável para preço/catálogo, não usado para decisão de estoque (que tem seu próprio mecanismo, ADR-002).
- **Compliance**: TTL configurado via variável de ambiente; um teste automatizado futuro pode checar continuamente se a taxa de acerto do cache não caiu abaixo de um limiar e alertar quando isso acontecer (o que a *Fundamentals of Software Architecture* chama de *fitness function*).

### ADR-002. Reserva de estoque no Redis (TTL nativo) em vez de banco dedicado na Fase 1

- **Status**: Aceito
- **Contexto**: preciso garantir que a checagem de saldo e o decremento do estoque aconteçam como uma única operação indivisível — sem intervalo entre "checar se há saldo" e "subtrair uma unidade" onde outra requisição possa se intrometer — para nunca vender mais do que existe, sem alterar o ERP nem esperar a criação de um banco próprio da loja.
- **Decisão**: essa operação indivisível é um script Lua no mesmo Redis do cache — o Redis garante que o script inteiro rode sem interrupção de outra requisição no meio. O TTL de 2 minutos é dimensionado para cobrir com folga o pior caso da janela de retry do ADR-004 (~12–15s), não um "tempo de carrinho" (ADR-007). Quando o TTL expira, o pedido é marcado `failed` e qualquer retry em andamento é cancelado — para nunca haver uma confirmação tardia do ERP chegando depois que a reserva já foi liberada.
- **Consequências**: elimina overselling com esforço mínimo de implementação; introduz dependência de que o Redis tenha persistência habilitada (AOF) para não perder reservas em um restart — mitigado pelo TTL curto e pela reconciliação com o ERP.
- **Compliance**: revisão manual do script Lua no code review; teste de concorrência automatizado (Pergunta 5 do documento da Parte 1.A) como gate de CI.

### ADR-003. Idempotência via `Idempotency-Key` armazenada no Redis

- **Status**: Aceito
- **Contexto**: retries de rede e duplo clique podem gerar pedidos duplicados se não houver deduplicação no backend.
- **Decisão**: toda chamada a `POST /checkout` exige `Idempotency-Key`; a chave e a resposta associada ficam no Redis com TTL de 24h.
- **Consequências**: elimina duplicidade sem exigir tabela dedicada; se o Redis for perdido dentro da janela de 24h, uma repetição rara poderia não ser deduplicada — risco aceito nesta fase e reavaliado ao migrar para Postgres na Fase 2.
- **Compliance**: teste de integração cobrindo reenvio da mesma chave.

### ADR-004. Fallback assíncrono in-process (sem fila dedicada) na Fase 1

- **Status**: Aceito — Superseded by ADR-005 na Fase 2 (fila durável)
- **Contexto**: o checkout precisa parar de travar esperando o ERP, mas subir um broker de mensageria (RabbitMQ) com workers dedicados em 30 dias aumenta significativamente o escopo de infraestrutura a entregar.
- **Premissa (não verificada)**: estou assumindo que o número de pedidos "pegos no meio" de uma janela de deploy é pequeno o bastante para ser um risco aceitável. O case fala em "milhões de acessos" na vitrine, mas não dá nenhum número de pedidos/minuto no checkout — não sei de fato qual é a ordem de grandeza real, nem a frequência de deploy planejada.
- **Decisão**: quando o ERP não responde dentro do timeout (3s), a API retorna `202 pending` ao cliente e continua tentando o ERP em background, dentro do próprio processo Node, com retry e backoff exponencial (até 3 tentativas). Essa janela de retry é o que dimensiona o TTL da reserva de estoque (ADR-002): se as 3 tentativas se esgotarem sem sucesso, ou se o TTL expirar antes disso, o pedido é marcado `failed` e nenhum retry adicional é feito — a reserva e o resultado do pedido andam sempre juntos.
- **Condição que reverteria esta decisão**: se a métrica de Compliance abaixo mostrar um volume de pedidos afetados maior do que o tolerável, a Fase 2 (fila durável) deveria ser antecipada, não esperar os 30-60 dias planejados.
- **Consequências**: entrega rápida e sem infraestrutura nova; trade-off explícito de durabilidade — se o processo reiniciar exatamente enquanto um pedido está sendo reenviado ao ERP, esse progresso se perde. Mitigado em duas camadas: a reserva de estoque já está garantida no Redis (não há venda além do estoque), e o cron de reconciliação (ADR-008) resolve esse pedido sozinho em até 5 minutos — o cliente vê um atraso pequeno, não uma compra perdida. Este ADR é superado na Fase 2, quando o mesmo fluxo passa a usar fila durável e esse atraso deixa de existir.
- **Compliance**: métricas de quantos pedidos ficam `pending` por mais de 5 minutos (ou seja, o cron do ADR-008 rodou e não resolveu), usadas como sinal para acelerar a Fase 2 se o volume for maior que o esperado.

### ADR-005. Fila de faturamento estilo task queue (AMQP/BullMQ) em vez de log particionado (Fase 2)

- **Status**: Aceito
- **Contexto**: o worker de faturamento precisa processar cada pedido individualmente, com ack, retry e isolamento de falha por mensagem (um pedido problemático não pode travar os demais).
- **Premissa (não verificada)**: estou assumindo que nenhum caso de uso futuro vai precisar de múltiplos consumidores independentes lendo o mesmo stream de eventos de pedido (ex. um serviço de analytics em tempo real, além do worker de faturamento). O case não menciona nada nessa linha, mas também não é algo que ele descarta explicitamente.
- **Decisão**: dado isso, usarei um broker estilo AMQP (RabbitMQ ou BullMQ sobre Redis) com dead letter queue, e não um log particionado estilo Kafka.
- **Condição que reverteria esta decisão**: se surgir um consumidor independente do faturamento que precise do mesmo stream de eventos (replay incluído), a fila de tarefas não serve para isso — seria necessário introduzir um log particionado ao lado dela, não substituí-la.
- **Consequências**: ganho ack/retry/DLQ por mensagem "de graça"; perco replay arbitrário do histórico de eventos e fan-out nativo para múltiplos consumidores independentes.
- **Compliance**: métrica de tamanho da DLQ como alerta operacional.

### ADR-006. Sincronização de catálogo via API do ERP (não CDC direto no binlog) até haver contrato estável

- **Status**: Aceito
- **Contexto**: CDC direto no log de replicação do MySQL do ERP (ex. via Debezium) reduziria a defasagem de sincronização, mas exporia implicitamente o schema interno das tabelas do ERP como dependência da loja — o case veda alterações e não garante estabilidade dessas tabelas.
- **Decisão**: a sincronização de catálogo/estoque continuará via pull na API REST do ERP (contrato já estável e público) mesmo na Fase 3; CDC direto no binlog só será adotado se/quando o time do ERP expuser um contrato explícito para isso (ex. tabela de outbox).
- **Consequências**: sincronização um pouco mais lenta (pull) do que seria com CDC (stream); em troca, a loja não quebra silenciosamente se alguém renomear uma coluna interna do ERP.
- **Compliance**: revisão desta decisão sempre que o time do ERP propuser expor um contrato de eventos.

### ADR-007. Não incluir carrinho multi-item no escopo do mini-projeto

- **Status**: Aceito
- **Contexto**: o case descreve a jornada de compra sempre no singular (um produto, uma quantidade, uma tentativa), e os critérios de avaliação giram em torno de consistência de estoque, idempotência, concorrência e contrato de erros — nenhum deles depende de um carrinho multi-item. Avaliei se adicionar um carrinho (coleção de itens antes do checkout) tornaria a solução mais completa.
- **Premissa (não verificada)**: estou lendo "escolha uma quantidade e tente finalizar uma compra" e "selecionar um produto" (checklist) como evidência de que não existe carrinho — mas isso é uma **inferência da minha parte a partir da linguagem no singular**, não uma afirmação explícita do case de que carrinho está fora de escopo. É possível que quem escreveu o case simplesmente não tenha detalhado esse ponto, sem necessariamente excluí-lo.
- **Decisão**: dado o estado atual dessa premissa, não vou implementar carrinho; o checkout permanece de item único (`productId` + `quantity`). Não existe, portanto, um conceito de "Carrinho" no domínio — a unidade de trabalho é a **Tentativa de Checkout**, efêmera e de item único.
- **Condição que reverteria esta decisão**: se o avaliador confirmar que esperava um fluxo multi-item, ou se a Parte 1.B for reenviada com esse feedback, a decisão do carrinho multi-item volta à mesa — e nesse caso a reserva de estoque deixa de ser a operação indivisível sobre um produto só e passa a ser um caso de write skew multi-objeto (ver [`designing-data-intensive-applications.md`](designing-data-intensive-applications.md), seção 2), exigindo redesenho, não extensão incremental.
- **Consequências**: menor superfície de implementação e teste, mais foco nos critérios avaliados; abro mão de demonstrar um domínio de agregação de itens; carrego o risco (pequeno, mas real) de ter lido a premissa errado.
- **Compliance**: revisar esta decisão apenas se o escopo do case mudar, se eu fizer uma entrega pós-desafio visando produção real, ou se a premissa acima for explicitamente confirmada ou refutada.

### ADR-008. Cron de reconciliação a cada 5 minutos na Fase 1

- **Status**: Aceito — Superseded por um worker de reconciliação automático na Fase 3
- **Contexto**: o fallback in-process do ADR-004 pode deixar um pedido "preso" em `pending` se o processo da loja reiniciar bem no meio de uma tentativa de reenvio ao ERP. Sem nenhum mecanismo cuidando disso, esse pedido ficaria pendente indefinidamente, e o cliente nunca saberia o resultado.
- **Decisão**: um script standalone roda a cada 5 minutos, compara os pedidos `pending`/`processing` com o status real no ERP, e resolve cada um sozinho — confirma se o ERP já processou, ou marca `failed` e libera a reserva de estoque se não.
- **Consequências**: muito barato de implementar (não exige fila nem infraestrutura nova); em troca, o pior caso de atraso para resolver um pedido preso é de até 5 minutos, não instantâneo. É esse mesmo mecanismo que limita o risco residual do ADR-004 a "atraso pequeno", em vez de "venda perdida" ou "pedido perdido para sempre".
- **Compliance**: alerta se a mesma divergência persistir por mais de um ciclo do cron (ou seja, ele rodou e não conseguiu resolver sozinho) — sinal de que algo além do cenário esperado está acontecendo e precisa de olhar manual.

---

## Matriz de risco (antes × depois da Fase 1)

Risco = impacto (1–3) × probabilidade (1–3). 1–2 = baixo (verde), 3–4 = médio (amarelo), 6–9 = alto (vermelho). Formato conforme [`fundamentals-of-software-architecture.md`](fundamentals-of-software-architecture.md), seção 4.

> Os números abaixo são minha avaliação qualitativa seguindo essa metodologia, não dados medidos em produção — não existe produção ainda. Servem para comparar "antes vs depois" de forma consistente, não como métrica absoluta.

**Antes (arquitetura atual)**

| Critério de risco | Vitrine/Catálogo | Checkout |
|---|---|---|
| Disponibilidade | 6 (alto) | 6 (alto) |
| Performance/Escalabilidade | 9 (alto) | 6 (alto) |
| Consistência de estoque | — | 9 (alto) |
| Resiliência a falha do ERP | 6 (alto) | 6 (alto) |

**Depois da Fase 1 (0–30 dias)**

| Critério de risco | Vitrine/Catálogo | Checkout |
|---|---|---|
| Disponibilidade | 2 (baixo) ↓ | 2 (baixo) ↓ |
| Performance/Escalabilidade | 1 (baixo) ↓ | 2 (baixo) ↓ |
| Consistência de estoque | — | 2 (baixo) ↓ |
| Resiliência a falha do ERP | 2 (baixo) ↓ | 3 (médio) ↓ |

A resiliência do checkout cai para "médio" (e não "baixo") de propósito: o trade-off do ADR-004 (fallback in-process em vez de fila durável) deixa um risco residual — se o processo reiniciar no meio do reenvio de um pedido, o cron de reconciliação (ADR-008) resolve isso automaticamente, mas em até 5 minutos, não na hora. Esse pequeno atraso só é eliminado de vez na Fase 2, com fila durável.

**Depois da Fase 2 (30–60 dias)**

| Critério de risco | Vitrine/Catálogo | Checkout |
|---|---|---|
| Disponibilidade | 2 (baixo) | 2 (baixo) |
| Performance/Escalabilidade | 1 (baixo) | 2 (baixo) |
| Consistência de estoque | — | 1 (baixo) ↓ |
| Resiliência a falha do ERP | 2 (baixo) | 2 (baixo) ↓ |

Duas melhorias em relação à Fase 1, ambas ligadas às mudanças do ADR-005: a fila durável elimina de vez o atraso residual de até 5 minutos do ADR-004/ADR-008 — Resiliência a falha do ERP (Checkout) cai de 3 para 2. E a migração de reservas/pedidos do Redis para um Postgres próprio da loja remove a dependência de o Redis ter AOF habilitado (citada na Consequência do ADR-002) para não perder uma reserva num restart — o já baixo risco de Consistência de estoque cai mais ainda, de 2 para 1. Vitrine/Catálogo não muda: o cache-aside (ADR-001) continua o mesmo na Fase 2.

**Depois da Fase 3 (60–90 dias)**: as quatro dimensões acima já estão em risco baixo desde o fim da Fase 2 — a Fase 3 não move mais essa pontuação, porque não há mais nada de "alto" ou "médio" restando para reduzir. O que ela entrega é outra coisa: reduz a defasagem de sincronização do catálogo (de minutos para segundos, dentro do limite do ADR-006) e substitui o cron do ADR-008 por reconciliação automática — ganho operacional e de latência, não mitigação adicional de risco nessas quatro dimensões.
