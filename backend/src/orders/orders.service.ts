import { Injectable } from "@nestjs/common";

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
  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = 1;

  createOrder(productId: string, quantity: number): Order {
    const id = `ord_${String(this.nextOrderNumber++).padStart(6, "0")}`;
    const order: Order = { id, productId, quantity, status: "pending", createdAt: Date.now() };
    this.orders.set(id, order);
    return order;
  }

  getOrder(id: string): Order | undefined {
    return this.orders.get(id);
  }

  markConfirmed(id: string): void {
    const order = this.orders.get(id);
    if (order && order.status === "pending") order.status = "confirmed";
  }

  markFailed(id: string, errorCode: string, errorMessage: string): void {
    const order = this.orders.get(id);
    if (order && order.status === "pending") {
      order.status = "failed";
      order.errorCode = errorCode;
      order.errorMessage = errorMessage;
    }
  }
}
