import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ORDER_REPOSITORY, OrderRepository } from "./domain/order.repository";
import { OrderNotFoundError } from "./domain/errors/order-not-found.error";

@Controller("orders")
export class OrdersController {
  constructor(@Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository) {}

  @Get(":id")
  getStatus(@Param("id") id: string) {
    const order = this.orders.findById(id);
    if (!order) throw new OrderNotFoundError();

    if (order.status === "failed") {
      return {
        orderId: order.id,
        status: "failed",
        error: { code: order.errorCode, message: order.errorMessage },
      };
    }
    return { orderId: order.id, status: order.status };
  }
}
