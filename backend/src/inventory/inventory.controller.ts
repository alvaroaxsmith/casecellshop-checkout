import { Controller, Get, Inject } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "./domain/product.repository";
import { StockService } from "./domain/stock.service";

@Controller("products")
export class InventoryController {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly stock: StockService,
  ) {}

  @Get()
  list() {
    const products = this.products.findAll().map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      stock: this.stock.availableStock(p.id),
    }));
    return { products };
  }
}
