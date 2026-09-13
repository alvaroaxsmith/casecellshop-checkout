import { Injectable } from "@nestjs/common";
import { ProductRepository } from "../domain/product.repository";
import { Product } from "../domain/product.entity";

@Injectable()
export class InMemoryProductRepository implements ProductRepository {
  private readonly products: Product[] = [
    new Product("capinha-preta", "Capinha Preta Fosca", 3990, 5),
    new Product("capinha-transparente", "Capinha Transparente", 2990, 10),
    new Product("capinha-listrada", "Capinha Listrada", 3490, 1),
  ];

  findById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  findAll(): Product[] {
    return this.products;
  }

  save(): void {
    // The entity handed to save() is already the same in-memory instance held above — nothing to persist.
  }
}
