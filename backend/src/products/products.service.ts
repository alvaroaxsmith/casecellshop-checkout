import { Injectable } from "@nestjs/common";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
}

interface Reservation {
  productId: string;
  quantity: number;
  status: "active" | "confirmed" | "released";
  expiresAt: number;
}

const RESERVATION_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class ProductsService {
  private readonly products: Product[] = [
    { id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5 },
    { id: "capinha-transparente", name: "Capinha Transparente", priceCents: 2990, stock: 10 },
    { id: "capinha-listrada", name: "Capinha Listrada", priceCents: 3490, stock: 1 },
  ];

  private readonly reservations = new Map<string, Reservation>();

  listProducts(): Product[] {
    return this.products;
  }

  findProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  availableStock(productId: string): number {
    this.sweepExpired();
    const product = this.products.find((p) => p.id === productId);
    if (!product) return 0;
    return product.stock - this.reservedFor(productId);
  }

  reserveStock(orderId: string, productId: string, quantity: number): boolean {
    this.sweepExpired();
    const product = this.products.find((p) => p.id === productId);
    if (!product) return false;

    const available = product.stock - this.reservedFor(productId);
    if (available < quantity) return false;

    this.reservations.set(orderId, {
      productId,
      quantity,
      status: "active",
      expiresAt: Date.now() + RESERVATION_TTL_MS,
    });
    return true;
  }

  confirmReservation(orderId: string): void {
    const reservation = this.reservations.get(orderId);
    if (!reservation || reservation.status !== "active") return;

    const product = this.products.find((p) => p.id === reservation.productId);
    if (product) product.stock -= reservation.quantity;

    reservation.status = "confirmed";
  }

  releaseReservation(orderId: string): void {
    const reservation = this.reservations.get(orderId);
    if (!reservation || reservation.status !== "active") return;

    reservation.status = "released";
  }

  private reservedFor(productId: string): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "active" && reservation.productId === productId) {
        total += reservation.quantity;
      }
    }
    return total;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "active" && reservation.expiresAt <= now) {
        reservation.status = "released";
      }
    }
  }
}
