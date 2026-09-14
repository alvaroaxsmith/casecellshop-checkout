import { Injectable, Logger } from "@nestjs/common";

export interface CheckoutSuccessBody {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  private readonly store = new Map<string, CheckoutSuccessBody>();

  getStoredResponse(key: string): CheckoutSuccessBody | undefined {
    const hit = this.store.get(key);
    this.logger.debug(`Consulta de idempotência — idempotencyKey=${key} result=${hit ? "hit" : "miss"}${hit ? ` orderId=${hit.orderId}` : ""}`);
    return hit;
  }

  storeResponse(key: string, response: CheckoutSuccessBody): void {
    this.store.set(key, response);
    this.logger.debug(`Resposta de sucesso armazenada — idempotencyKey=${key} orderId=${response.orderId}`);
  }
}
