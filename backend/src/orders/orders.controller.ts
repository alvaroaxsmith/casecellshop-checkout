import { Controller, Get, Param } from "@nestjs/common";
import { OrdersService } from "./orders.service";
import { OrderNotFoundException } from "../common/exceptions/app.exception";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":id")
  getStatus(@Param("id") id: string) {
    const order = this.orders.getOrder(id);
    if (!order) throw new OrderNotFoundException();

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
