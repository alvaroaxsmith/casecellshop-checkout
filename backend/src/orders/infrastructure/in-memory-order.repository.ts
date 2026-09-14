import { Injectable } from "@nestjs/common";
import { OrderRepository } from "../domain/order.repository";
import { Order } from "../domain/order.entity";

@Injectable()
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders = new Map<string, Order>();
  private nextOrderNumber = 1;

  create(productId: string, quantity: number): Order {
    const id = `ord_${String(this.nextOrderNumber++).padStart(6, "0")}`;
    const order = new Order(id, productId, quantity, Date.now());
    this.orders.set(id, order);
    return order;
  }

  findById(id: string): Order | undefined {
    return this.orders.get(id);
  }

  save(): void {
    // The entity handed to save() is already the same in-memory instance held above — nothing to persist.
  }
}
