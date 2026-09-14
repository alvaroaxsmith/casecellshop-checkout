import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

export interface CheckoutSuccessBody {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly redis: RedisService) {}

  async getStoredResponse(key: string): Promise<CheckoutSuccessBody | undefined> {
    const raw = await this.redis.client.get(`idempotency:${key}`);
    this.logger.debug(
      `Consulta de idempotência — idempotencyKey=${key} result=${raw ? "hit" : "miss"}`,
    );
    return raw ? (JSON.parse(raw) as CheckoutSuccessBody) : undefined;
  }

  async storeResponse(key: string, response: CheckoutSuccessBody): Promise<void> {
    await this.redis.client.set(`idempotency:${key}`, JSON.stringify(response), "EX", IDEMPOTENCY_TTL_SECONDS);
    this.logger.debug(`Resposta de sucesso armazenada — idempotencyKey=${key} orderId=${response.orderId} ttlSeconds=${IDEMPOTENCY_TTL_SECONDS}`);
  }
}
