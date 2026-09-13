import { Inject, Injectable } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "./product.repository";
import { STOCK_RESERVATION_REPOSITORY, StockReservationRepository } from "./stock-reservation.repository";
import { StockReservation } from "./stock-reservation.entity";

const RESERVATION_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class StockService {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(STOCK_RESERVATION_REPOSITORY) private readonly reservations: StockReservationRepository,
  ) {}

  availableStock(productId: string): number {
    this.sweepExpired();
    const product = this.products.findById(productId);
    if (!product) return 0;
    return product.stock - this.reservedFor(productId);
  }

  reserveStock(orderId: string, productId: string, quantity: number): boolean {
    this.sweepExpired();
    const product = this.products.findById(productId);
    if (!product) return false;

    const available = product.stock - this.reservedFor(productId);
    if (available < quantity) return false;

    const reservation = new StockReservation(orderId, productId, quantity, Date.now() + RESERVATION_TTL_MS);
    this.reservations.save(reservation);
    return true;
  }

  confirmReservation(orderId: string): void {
    const reservation = this.reservations.findByOrderId(orderId);
    if (!reservation) return;

    const product = this.products.findById(reservation.productId);
    product?.deduct(reservation.quantity);
    if (product) this.products.save(product);

    reservation.confirm();
    this.reservations.save(reservation);
  }

  releaseReservation(orderId: string): void {
    const reservation = this.reservations.findByOrderId(orderId);
    if (!reservation) return;

    reservation.release();
    this.reservations.save(reservation);
  }

  private reservedFor(productId: string): number {
    return this.reservations
      .findActive()
      .filter((r) => r.productId === productId)
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const reservation of this.reservations.findActive()) {
      if (reservation.isExpired(now)) {
        reservation.release();
        this.reservations.save(reservation);
      }
    }
  }
}
