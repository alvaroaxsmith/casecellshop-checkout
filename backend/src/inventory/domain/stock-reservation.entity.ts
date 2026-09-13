export type StockReservationStatus = "active" | "confirmed" | "released";

export class StockReservation {
  private status_: StockReservationStatus = "active";

  constructor(
    public readonly orderId: string,
    public readonly productId: string,
    public readonly quantity: number,
    private readonly expiresAt: number,
  ) {}

  get status(): StockReservationStatus {
    return this.status_;
  }

  isExpired(now: number): boolean {
    return this.status_ === "active" && now >= this.expiresAt;
  }

  confirm(): void {
    if (this.status_ !== "active") return;
    this.status_ = "confirmed";
  }

  release(): void {
    if (this.status_ !== "active") return;
    this.status_ = "released";
  }
}
