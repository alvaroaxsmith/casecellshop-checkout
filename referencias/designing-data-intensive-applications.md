# Designing Data-Intensive Applications — Trechos de Referência

- **Livro**: Designing Data-Intensive Applications: The Big Ideas Behind Reliable, Scalable, and Maintainable Systems
- **Autores**: Martin Kleppmann, Chris Riccomini
- **Edição**: 2ª edição
- **Editora**: O'Reilly, 2026

Trechos extraídos e usados como base para o [`Parte 1.A — Perguntas Conceituais.md`](../Parte%201.A%20—%20Perguntas%20Conceituais.md). Numeração de página conforme impressa no livro (não a página física do PDF).

---

## 1. Preventing Lost Updates (Capítulo 8 "Transactions", p. 299–302)

O **lost update problem**: ocorre quando duas transações concorrentes fazem um ciclo *read-modify-write* sobre o mesmo valor — cada uma lê, calcula um novo valor e escreve de volta — e a segunda escrita "engole" (*clobbers*) o efeito da primeira, sem gerar erro algum.

Soluções descritas, da mais para a menos recomendada quando aplicável:

1. **Atomic write operations** — ex. `UPDATE counters SET value = value + 1 WHERE key = 'foo'` — thread-safe nativamente na maioria dos bancos relacionais; a melhor opção sempre que a operação puder ser expressa dessa forma.
2. **Explicit locking** — `SELECT ... FOR UPDATE` seguido de `UPDATE` na mesma transação.
3. **Automatic detection** — alguns bancos abortam automaticamente a transação perdedora sob snapshot isolation. Ponto importante citado explicitamente: **o `REPEATABLE READ` do MySQL/InnoDB não detecta lost updates**, ao contrário do `REPEATABLE READ` do PostgreSQL ou do `SERIALIZABLE` do Oracle.
4. **Conditional writes (compare-and-set)** — a escrita só é aplicada se o valor não mudou desde a última leitura; o equivalente, em nível de banco de dados, da instrução CAS de CPU.

**Usado em**: Pergunta 1 (Problema 02 — Consistência de estoque) e Pergunta 3 (mecanismo de reserva de estoque) do documento da Parte 1.A — a versão simplificada explica o mesmo raciocínio em linguagem direta, sem nomear "lost update" ou citar o comportamento do MySQL/InnoDB. O alerta específico sobre o InnoDB não detectar lost updates e a referência formal a *atomic write operation*/*compare-and-set* continuam registrados no ADR-002, em [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 2. Write Skew and Phantoms (Capítulo 8, p. 303–306)

**Write skew**: generalização do lost update para múltiplos objetos — duas transações leem o(s) mesmo(s) objeto(s), cada uma decide agir com base no que leu, e cada uma escreve em um objeto *diferente*; o resultado final viola uma invariante que só se sustentava porque as duas leituras aconteceram "ao mesmo tempo". Exemplo do livro: dois médicos de plantão pedem para sair ao mesmo tempo, cada checagem vê "ainda há 2 de plantão" e aprova a própria saída — no fim, ninguém fica de plantão.

Write skew **não** é prevenido automaticamente por snapshot isolation (PostgreSQL `REPEATABLE READ`, MySQL/InnoDB `REPEATABLE READ`, Oracle `SERIALIZABLE` inclusos) — só isolamento serializável verdadeiro previne, ou lock explícito sobre todas as linhas envolvidas na decisão.

Outros exemplos citados no livro: sistema de reserva de sala de reunião (duas reservas conflitantes inseridas concorrentemente), jogo multiplayer (duas peças movidas para a mesma posição), reserva de nome de usuário único, e prevenção de gasto duplicado (double-spending).

**Usado em**: nota de escopo "por que o checkout não tem carrinho" na Pergunta 4 do documento da Parte 1.A — a versão simplificada não nomeia "write skew", só diz que "cada produto a mais é mais uma chance de dois clientes disputarem coisas diferentes ao mesmo tempo". O argumento técnico completo (por que isso deixaria de ser um decremento atômico de objeto único e viraria write skew multi-objeto) está no ADR-007, em [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 3. Exactly-Once Message Processing Revisited (Capítulo 8, p. 334–335)

Alternativa a uma transação distribuída completa (2PC entre fila e banco) para atingir semântica *exactly-once*: registrar o **ID único de cada mensagem/requisição** numa tabela do próprio banco, dentro da mesma transação que aplica o efeito da mensagem.

Passo a passo descrito no livro:

1. toda mensagem carrega um ID único;
2. ao começar a processar, abre-se uma transação e checa-se se esse ID já está na tabela de IDs processados;
3. se já estiver — a mensagem já foi processada; confirma-se (`ack`) ao broker e descarta-se, sem reprocessar;
4. se não estiver — insere-se o ID na tabela, aplica-se o efeito da mensagem, e só então a transação é commitada;
5. só depois do commit é que a mensagem é confirmada (`ack`) ao broker;
6. opcionalmente, após o `ack` confirmado, o ID pode ser removido da tabela (em transação separada) apenas por limpeza de espaço.

Conclusão explícita do livro, citada literalmente como argumento contra over-engineering: **"you don't actually need distributed transactions to achieve exactly-once semantics"** — registrar o ID de forma idempotente, dentro de transações locais ao banco, já é suficiente.

**Usado em**: Pergunta 3 do documento da Parte 1.A (explicação do mecanismo de idempotência) — a versão simplificada descreve os mesmos passos em linguagem direta ("a loja checa se esse código já apareceu... se já apareceu, devolve a mesma resposta de antes"), sem citar o nome do padrão. A referência formal ao passo a passo do livro está no ADR-003, em [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 4. Messaging Systems e Log-Based Message Brokers (Capítulo 12 "Stream Processing", p. 489–499)

Dois padrões de distribuição de mensagens entre consumidores (Figure 12-1): **load balancing** (cada mensagem vai para exatamente um consumidor do grupo, dividindo o trabalho) e **fan-out** (cada mensagem é entregue a todos os consumidores/grupos inscritos, cada um vendo o stream completo).

**Brokers estilo AMQP/JMS** (RabbitMQ, ActiveMQ): a mensagem é removida do broker após confirmação (`ack`) do consumidor; se o consumidor cair antes de confirmar, a mensagem é reentregue a outro consumidor (*redelivery*), o que pode até reordenar mensagens quando combinado com load balancing (Figure 12-2). Suportam nativamente **Dead Letter Queue (DLQ)** para mensagens que falham repetidamente, evitando que uma mensagem "envenenada" bloqueie o processamento das demais.

**Brokers baseados em log** (Kafka, Kinesis): mensagens ficam armazenadas em partições ordenadas e append-only; ler uma mensagem não a remove, então múltiplos consumidores podem processar o mesmo stream de forma independente, inclusive reprocessando (*replay*) desde um offset anterior. É o modelo preferível quando o throughput precisa ser muito alto e há necessidade real de replay/fan-out para consumidores independentes; o modelo AMQP tradicional é preferível quando cada mensagem representa uma tarefa cara e individual que precisa de ack/retry por item.

**Usado em**: decisão de usar "uma fila simples de pedidos, não um sistema de streaming" na Fase 2 (Pergunta 2 do documento da Parte 1.A) — a comparação detalhada entre broker estilo AMQP e log particionado, que justifica essa escolha, está no ADR-005, em [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 5. Databases and Streams — Dual Writes e Change Data Capture (Capítulo 12, p. 500–507)

**Dual writes**: escrever separadamente em dois sistemas a partir do código da aplicação — por exemplo, gravar num banco *e* atualizar um índice de busca, como duas operações independentes. O livro ilustra (Figure 12-4) por que isso é uma race condition por construção: se duas escritas concorrentes chegam em ordens diferentes aos dois sistemas, eles ficam permanentemente inconsistentes entre si, sem gerar nenhum erro visível. Dual writes também sofrem de falha parcial — uma das duas escritas pode ter sucesso enquanto a outra falha.

**Change Data Capture (CDC)**: captura as mudanças já commitadas no log de replicação de um banco "sistema de registro" (ex. o binlog do MySQL) e as propaga, na mesma ordem em que ocorreram, como um stream para sistemas derivados (índice de busca, data warehouse, outro banco). O **Debezium** é citado nominalmente como projeto open source com conectores prontos para MySQL, PostgreSQL, Oracle, SQL Server, Db2 e Cassandra, entre outros.

Callout específico do livro, "Change Data Capture and Database Schemas": ao usar CDC direto no log de replicação, **o schema interno das tabelas do banco de origem vira, na prática, uma API pública** da qual os sistemas consumidores passam a depender — uma mudança de schema (ex. remover uma coluna) que antes só afetava o dono do banco agora pode quebrar consumidores downstream, inclusive em produção. O **outbox pattern** (uma tabela dedicada, com schema próprio e estável, exposta ao CDC em vez do modelo de domínio interno) é citado como mitigação comum para esse acoplamento.

**Usado em**: a regra "só o ERP escreve estoque e catálogo de verdade; a loja só lê" na Pergunta 2 do documento da Parte 1.A é a versão em linguagem simples do princípio "nunca fazer dual write". A Fase 3 também traz, em uma frase, a cautela contra "acessar o banco do ERP por baixo dos panos" — essa é a versão curta do risco de CDC acoplar ao schema interno do ERP, detalhado por completo no ADR-006, em [`decisoes-tecnicas.md`](decisoes-tecnicas.md).

---

## 6. Problems with Replication Lag (Capítulo 6 "Replication", p. 209–212)

**Eventual consistency**: quando réplicas são atualizadas de forma assíncrona a partir de um líder, uma leitura numa réplica atrasada pode retornar dados desatualizados em relação ao líder. A inconsistência é temporária — se as escritas pararem, as réplicas eventualmente convergem para o mesmo estado (daí o nome).

**Read-after-write consistency** (também chamada *read-your-writes*): garantia de que o próprio usuário sempre vê as atualizações que ele mesmo acabou de fazer, mesmo que outros usuários, lendo de réplicas diferentes, ainda vejam dados antigos por mais algum tempo.

**Monotonic reads**: garante que, se um usuário fizer múltiplas leituras em sequência, ele nunca vai "ver o tempo andar para trás" — ou seja, nunca lerá um dado mais antigo depois de já ter lido uma versão mais nova dele.

**Usado em**: princípio de design por trás do item 1 da Fase 1 (Pergunta 2 do documento da Parte 1.A) — o cache de catálogo é deliberadamente eventualmente consistente por até ~30s, enquanto a reserva de estoque (item 2) é sempre lida direto do Redis, nunca do cache. A versão simplificada do documento não explica mais esse raciocínio em texto — os dois mecanismos aparecem como itens separados na lista da Fase 1, mas a distinção proposital entre "leitura da vitrine" e "decisão de venda" é esta aqui.
