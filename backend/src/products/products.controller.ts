import { Controller, Get } from "@nestjs/common";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list() {
    const products = this.products.listProducts().map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      stock: this.products.availableStock(p.id),
    }));
    return { products };
  }
}
