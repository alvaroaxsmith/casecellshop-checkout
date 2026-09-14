import { Module } from "@nestjs/common";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { ProductsModule } from "../products/products.module";
import { OrdersModule } from "../orders/orders.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";
import { ErpModule } from "../erp/erp.module";

@Module({
  imports: [ProductsModule, OrdersModule, IdempotencyModule, ErpModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
