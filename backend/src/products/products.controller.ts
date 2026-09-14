import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ProductsService } from "./products.service";
import { ProductListResponseDto } from "./product.dto";

@ApiTags("products")
@Controller("products")
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({
    summary: "Lista o catálogo de produtos",
    description:
      "Catálogo carregado do ERP na inicialização do backend, com o estoque disponível para venda de cada produto (estoque base menos reservas ativas).",
  })
  @ApiOkResponse({ type: ProductListResponseDto })
  list(): ProductListResponseDto {
    const products = this.products.listProducts().map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      stock: this.products.availableStock(p.id),
      imageUrl: p.imageUrl,
      imageAlt: p.imageAlt,
    }));
    return { products };
  }
}
