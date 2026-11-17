/** Regras de tentativa da liquidação com o ERP, feita em segundo plano depois do 202. */
export interface SettlementPolicy {
  /** Tempo máximo de espera por cada chamada ao ERP antes de desistir dela. */
  timeoutMs: number;
  /** Número total de chamadas ao ERP antes de marcar o pedido como `failed`. */
  maxAttempts: number;
  /**
   * Espera antes de cada nova tentativa: `backoffMs[0]` antes da 2ª, `backoffMs[1]` antes da 3ª,
   * e assim por diante. Se houver mais tentativas que valores, o último valor se repete.
   */
  backoffMs: readonly number[];
}

export const SETTLEMENT_POLICY = Symbol("SETTLEMENT_POLICY");

export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = {
  timeoutMs: 3000,
  maxAttempts: 3,
  backoffMs: [1000, 2000],
};
