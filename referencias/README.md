# Referências

Esta pasta guarda a camada mais profunda por trás da respostas do case tecnico Parte 1.A, para quem quiser entender o raciocínio completo.

- [decisoes-tecnicas.md](decisoes-tecnicas.md) — as 8 decisões técnicas em formato ADR (Contexto, Decisão, Consequências, e as suposições por trás de cada uma) e a matriz de risco antes/depois da Fase 1. Este é o ponto de partida mais direto se você quer entender *por que* cada escolha foi feita.
- [fundamentals-of-software-architecture.md](fundamentals-of-software-architecture.md) — trechos de Richards & Ford: leis da arquitetura, trade-offs, formato de ADR, matriz de risco, diagramação.
- [designing-data-intensive-applications.md](designing-data-intensive-applications.md) — trechos de Kleppmann & Riccomini: lost updates, write skew, exactly-once processing, dual writes, CDC, replicação/consistência eventual.

Cada um dos dois últimos arquivos aponta, trecho por trecho, para onde aquela ideia aparece hoje no documento da Parte 1.A (em linguagem simples) e/ou em `decisoes-tecnicas.md` (na versão formal, com a decisão registrada).
