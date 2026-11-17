import { Module } from "@nestjs/common";
import { ErpModule } from "../erp/erp.module";
import { IdempotencyModule } from "../idempotency/idempotency.module";
import { OrdersModule } from "../orders/orders.module";
import { ProductsModule } from "../products/products.module";
import { CheckoutController } from "./checkout.controller";
import { CheckoutService } from "./checkout.service";
import { DEFAULT_SETTLEMENT_POLICY, SETTLEMENT_POLICY } from "./settlement-policy";

@Module({
  imports: [ProductsModule, OrdersModule, IdempotencyModule, ErpModule],
  controllers: [CheckoutController],
  providers: [CheckoutService, { provide: SETTLEMENT_POLICY, useValue: DEFAULT_SETTLEMENT_POLICY }],
})
export class CheckoutModule {}
