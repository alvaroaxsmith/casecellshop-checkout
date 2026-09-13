import { StockReservation } from "./stock-reservation.entity";

export interface StockReservationRepository {
  save(reservation: StockReservation): void;
  findByOrderId(orderId: string): StockReservation | undefined;
  findActive(): StockReservation[];
}

export const STOCK_RESERVATION_REPOSITORY = Symbol("STOCK_RESERVATION_REPOSITORY");
