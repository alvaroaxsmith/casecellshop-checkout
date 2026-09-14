import { Module } from "@nestjs/common";
import { OrdersController } from "./orders.controller";
import { ORDER_REPOSITORY } from "./domain/order.repository";
import { InMemoryOrderRepository } from "./infrastructure/in-memory-order.repository";

@Module({
  controllers: [OrdersController],
  providers: [{ provide: ORDER_REPOSITORY, useClass: InMemoryOrderRepository }],
  exports: [ORDER_REPOSITORY],
})
export class OrdersModule {}
