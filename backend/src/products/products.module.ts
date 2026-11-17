import { Module } from "@nestjs/common";
import { ErpModule } from "../erp/erp.module";
import { ErpService } from "../erp/erp.service";
import { ProductsController } from "./products.controller";
import { Product, ProductsService } from "./products.service";

@Module({
  imports: [ErpModule],
  controllers: [ProductsController],
  providers: [
    {
      provide: ProductsService,
      useFactory: async (erp: ErpService): Promise<ProductsService> => {
        const catalog: Product[] = await erp.fetchCatalog();
        return new ProductsService(catalog);
      },
      inject: [ErpService],
    },
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
