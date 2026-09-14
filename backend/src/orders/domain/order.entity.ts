export type OrderStatus = "pending" | "confirmed" | "failed";

export class Order {
  private status_: OrderStatus = "pending";
  private errorCode_?: string;
  private errorMessage_?: string;

  constructor(
    public readonly id: string,
    public readonly productId: string,
    public readonly quantity: number,
    public readonly createdAt: number,
  ) {}

  get status(): OrderStatus {
    return this.status_;
  }

  get errorCode(): string | undefined {
    return this.errorCode_;
  }

  get errorMessage(): string | undefined {
    return this.errorMessage_;
  }

  confirm(): void {
    if (this.status_ !== "pending") return;
    this.status_ = "confirmed";
  }

  fail(errorCode: string, errorMessage: string): void {
    if (this.status_ !== "pending") return;
    this.status_ = "failed";
    this.errorCode_ = errorCode;
    this.errorMessage_ = errorMessage;
  }
}
