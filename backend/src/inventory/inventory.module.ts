import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { StockService } from "./domain/stock.service";
import { PRODUCT_REPOSITORY } from "./domain/product.repository";
import { STOCK_RESERVATION_REPOSITORY } from "./domain/stock-reservation.repository";
import { InMemoryProductRepository } from "./infrastructure/in-memory-product.repository";
import { InMemoryStockReservationRepository } from "./infrastructure/in-memory-stock-reservation.repository";

@Module({
  controllers: [InventoryController],
  providers: [
    StockService,
    { provide: PRODUCT_REPOSITORY, useClass: InMemoryProductRepository },
    { provide: STOCK_RESERVATION_REPOSITORY, useClass: InMemoryStockReservationRepository },
  ],
  exports: [StockService, PRODUCT_REPOSITORY],
})
export class InventoryModule {}
