import { Product } from "./product.entity";

export interface ProductRepository {
  findById(id: string): Product | undefined;
  findAll(): Product[];
  save(product: Product): void;
}

export const PRODUCT_REPOSITORY = Symbol("PRODUCT_REPOSITORY");
