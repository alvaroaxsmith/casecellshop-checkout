import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";

export type OrderStatus = "pending" | "confirmed" | "failed";

export interface Order {
  id: string;
  productId: string;
  quantity: number;
  status: OrderStatus;
  errorCode?: string;
  errorMessage?: string;
  createdAt: number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly redis: RedisService) {}

  async createOrder(productId: string, quantity: number): Promise<Order> {
    const seq = await this.redis.client.incr("order:seq");
    const id = `ord_${String(seq).padStart(6, "0")}`;
    const order: Order = { id, productId, quantity, status: "pending", createdAt: Date.now() };

    await this.redis.client.hset(`order:${id}`, this.serialize(order));
    this.logger.log(`Pedido criado — orderId=${id} productId=${productId} quantity=${quantity} status=pending`);
    return order;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const data = await this.redis.client.hgetall(`order:${id}`);
    if (Object.keys(data).length === 0) return undefined;
    return this.deserialize(data);
  }

  // markConfirmed/markFailed só são chamados de dentro do laço de retry de
  // um único pedido, em CheckoutService.settleWithErp — nunca duas vezes em
  // paralelo para o mesmo orderId — por isso o padrão ler-depois-escrever
  // abaixo não precisa da mesma atomicidade via Lua que reserveStock exige.
  async markConfirmed(id: string): Promise<void> {
    const order = await this.getOrder(id);
    if (!order || order.status !== "pending") {
      this.logger.debug(
        `markConfirmed ignorado (pedido inexistente ou não está mais pending) — orderId=${id} currentStatus=${order?.status ?? "none"}`,
      );
      return;
    }
    await this.redis.client.hset(`order:${id}`, { status: "confirmed" });
    this.logger.log(`Pedido confirmado — orderId=${id} status=confirmed`);
  }

  async markFailed(id: string, errorCode: string, errorMessage: string): Promise<void> {
    const order = await this.getOrder(id);
    if (!order || order.status !== "pending") {
      this.logger.debug(
        `markFailed ignorado (pedido inexistente ou não está mais pending) — orderId=${id} currentStatus=${order?.status ?? "none"}`,
      );
      return;
    }
    await this.redis.client.hset(`order:${id}`, { status: "failed", errorCode, errorMessage });
    this.logger.warn(`Pedido marcado como failed — orderId=${id} status=failed errorCode=${errorCode} errorMessage="${errorMessage}"`);
  }

  private serialize(order: Order): Record<string, string> {
    return {
      id: order.id,
      productId: order.productId,
      quantity: String(order.quantity),
      status: order.status,
      createdAt: String(order.createdAt),
    };
  }

  private deserialize(data: Record<string, string>): Order {
    return {
      id: data.id,
      productId: data.productId,
      quantity: Number(data.quantity),
      status: data.status as OrderStatus,
      createdAt: Number(data.createdAt),
      errorCode: data.errorCode,
      errorMessage: data.errorMessage,
    };
  }
}
