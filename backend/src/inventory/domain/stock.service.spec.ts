import { StockService } from "./stock.service";
import { Product } from "./product.entity";
import { ProductRepository } from "./product.repository";
import { StockReservation } from "./stock-reservation.entity";
import { StockReservationRepository } from "./stock-reservation.repository";

class FakeProductRepository implements ProductRepository {
  constructor(private readonly products: Product[]) {}

  findById(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  findAll(): Product[] {
    return this.products;
  }

  save(): void {}
}

class FakeStockReservationRepository implements StockReservationRepository {
  private readonly reservations = new Map<string, StockReservation>();

  save(reservation: StockReservation): void {
    this.reservations.set(reservation.orderId, reservation);
  }

  findByOrderId(orderId: string): StockReservation | undefined {
    return this.reservations.get(orderId);
  }

  findActive(): StockReservation[] {
    return [...this.reservations.values()].filter((r) => r.status === "active");
  }
}

describe("StockService", () => {
  it("reserves stock only while there is enough available", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 1)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    expect(stock.reserveStock("ord_1", "p1", 1)).toBe(true);
    expect(stock.reserveStock("ord_2", "p1", 1)).toBe(false);
  });

  it("returns reserved stock to availability on release, without touching the base stock", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 5)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    stock.reserveStock("ord_1", "p1", 1);
    expect(stock.availableStock("p1")).toBe(4);

    stock.releaseReservation("ord_1");
    expect(stock.availableStock("p1")).toBe(5);
  });

  it("permanently deducts stock on confirmation", () => {
    const products = new FakeProductRepository([new Product("p1", "Product", 1000, 5)]);
    const stock = new StockService(products, new FakeStockReservationRepository());

    stock.reserveStock("ord_1", "p1", 1);
    stock.confirmReservation("ord_1");

    expect(stock.availableStock("p1")).toBe(4);
  });
});
