import { Module } from "@nestjs/common";
import { ProductsModule } from "./products/products.module";
import { CheckoutModule } from "./checkout/checkout.module";
import { OrdersModule } from "./orders/orders.module";

@Module({
  imports: [ProductsModule, CheckoutModule, OrdersModule],
})
export class AppModule {}
