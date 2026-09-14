import { Controller, Get, Param } from "@nestjs/common";
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { OrdersService } from "./orders.service";
import { OrderNotFoundException } from "../common/exceptions/app.exception";
import { OrderStatusResponseDto } from "./order.dto";
import { ErrorResponseDto } from "../common/dto/error-response.dto";

@ApiTags("orders")
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get(":id")
  @ApiOperation({ summary: "Consulta o status atual de um pedido" })
  @ApiParam({ name: "id", example: "ord_000001" })
  @ApiOkResponse({ type: OrderStatusResponseDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: "Id de pedido desconhecido." })
  async getStatus(@Param("id") id: string): Promise<OrderStatusResponseDto> {
    const order = await this.orders.getOrder(id);
    if (!order) throw new OrderNotFoundException();

    if (order.status === "failed") {
      return {
        orderId: order.id,
        status: "failed",
        error: { code: order.errorCode!, message: order.errorMessage! },
      };
    }
    return { orderId: order.id, status: order.status };
  }
}
