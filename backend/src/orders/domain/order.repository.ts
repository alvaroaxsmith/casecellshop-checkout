import { Order } from "./order.entity";

export interface OrderRepository {
  create(productId: string, quantity: number): Order;
  findById(id: string): Order | undefined;
  save(order: Order): void;
}

export const ORDER_REPOSITORY = Symbol("ORDER_REPOSITORY");
