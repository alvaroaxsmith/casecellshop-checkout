import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutUseCase } from "./application/checkout.use-case";
import { InventoryModule } from "../inventory/inventory.module";
import { OrdersModule } from "../orders/orders.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";
import { ErpModule } from "../erp/erp.module";

@Module({
  imports: [InventoryModule, OrdersModule, IdempotencyModule, ErpModule],
  controllers: [CheckoutController],
  providers: [CheckoutUseCase],
})
export class CheckoutModule {}
