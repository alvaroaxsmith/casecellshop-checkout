import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { CheckoutModule } from "./checkout/checkout.module";
import { RequestLoggerMiddleware } from "./common/middleware/request-logger.middleware";
import { OrdersModule } from "./orders/orders.module";
import { ProductsModule } from "./products/products.module";

@Module({
  imports: [ProductsModule, CheckoutModule, OrdersModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes("*");
  }
}
