import { Injectable, Logger } from "@nestjs/common";

export interface CheckoutSuccessBody {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

/**
 * Resultado de consultar uma chave:
 * - `miss`: chave nunca vista, a requisição deve ser processada normalmente;
 * - `hit`: mesma chave e mesmo conteúdo, devolver a resposta original;
 * - `conflict`: mesma chave, mas com outro conteúdo (outro produto ou quantidade).
 */
export type IdempotencyLookup =
  | { kind: "miss" }
  | { kind: "hit"; response: CheckoutSuccessBody }
  | { kind: "conflict"; response: CheckoutSuccessBody };

interface StoredEntry {
  fingerprint: string;
  response: CheckoutSuccessBody;
  expiresAt: number;
}

/** Prazo de validade de uma chave (ADR-003): cobre retries e cliques duplicados com folga. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  private readonly store = new Map<string, StoredEntry>();

  /** `fingerprint` identifica o conteúdo da requisição (ex.: produto + quantidade). */
  lookup(key: string, fingerprint: string): IdempotencyLookup {
    this.sweepExpired();
    const entry = this.store.get(key);
    if (!entry) {
      this.logger.debug(`Consulta de idempotência — idempotencyKey=${key} result=miss`);
      return { kind: "miss" };
    }
    const kind = entry.fingerprint === fingerprint ? "hit" : "conflict";
    this.logger.debug(
      `Consulta de idempotência — idempotencyKey=${key} result=${kind} orderId=${entry.response.orderId}`,
    );
    return { kind, response: entry.response };
  }

  storeResponse(key: string, fingerprint: string, response: CheckoutSuccessBody): void {
    this.sweepExpired();
    this.store.set(key, { fingerprint, response, expiresAt: Date.now() + IDEMPOTENCY_TTL_MS });
    this.logger.debug(`Resposta de sucesso armazenada — idempotencyKey=${key} orderId=${response.orderId}`);
  }

  /**
   * Remove as chaves vencidas. Todas têm o mesmo prazo e o Map preserva a ordem de inserção,
   * então as mais antigas vêm primeiro: basta parar na primeira que ainda vale.
   */
  private sweepExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt > now) break;
      this.store.delete(key);
      this.logger.debug(`Chave de idempotência expirou — idempotencyKey=${key} orderId=${entry.response.orderId}`);
    }
  }
}
