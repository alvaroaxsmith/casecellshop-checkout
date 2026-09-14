import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { RedisModule } from "../redis/redis.module";
import { ErpModule } from "../erp/erp.module";

@Module({
  imports: [RedisModule, ErpModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
