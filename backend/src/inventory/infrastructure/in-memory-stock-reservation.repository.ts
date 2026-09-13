import { Injectable } from "@nestjs/common";
import { StockReservationRepository } from "../domain/stock-reservation.repository";
import { StockReservation } from "../domain/stock-reservation.entity";

@Injectable()
export class InMemoryStockReservationRepository implements StockReservationRepository {
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
