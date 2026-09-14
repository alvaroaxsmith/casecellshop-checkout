import { Injectable, Logger } from "@nestjs/common";

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

  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = 1;

  createOrder(productId: string, quantity: number): Order {
    const id = `ord_${String(this.nextOrderNumber++).padStart(6, "0")}`;
    const order: Order = { id, productId, quantity, status: "pending", createdAt: Date.now() };
    this.orders.set(id, order);
    this.logger.log(`Pedido criado — orderId=${id} productId=${productId} quantity=${quantity} status=pending`);
    return order;
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  markConfirmed(id: string): void {
    const order = this.orders.get(id);
    if (!order || order.status !== "pending") {
      this.logger.debug(`markConfirmed ignorado (pedido inexistente ou não está mais pending) — orderId=${id} currentStatus=${order?.status ?? "none"}`);
      return;
    }
    order.status = "confirmed";
    this.logger.log(`Pedido confirmado — orderId=${id} status=confirmed`);
  }

  markFailed(id: string, errorCode: string, errorMessage: string): void {
    const order = this.orders.get(id);
    if (!order || order.status !== "pending") {
      this.logger.debug(`markFailed ignorado (pedido inexistente ou não está mais pending) — orderId=${id} currentStatus=${order?.status ?? "none"}`);
      return;
    }
    order.status = "failed";
    order.errorCode = errorCode;
    order.errorMessage = errorMessage;
    this.logger.warn(`Pedido marcado como failed — orderId=${id} status=failed errorCode=${errorCode} errorMessage="${errorMessage}"`);
  }
}
