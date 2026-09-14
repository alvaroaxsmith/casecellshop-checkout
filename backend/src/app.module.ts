import { Module } from "@nestjs/common";
import { InventoryModule } from "./inventory/inventory.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [InventoryModule, CheckoutModule, OrdersModule],
})
export class AppModule {}
