import { Injectable } from "@nestjs/common";

export interface CheckoutSuccessBody {
  orderId: string;
  status: "pending";
  statusUrl: string;
}

@Injectable()
export class IdempotencyService {
  private readonly store = new Map<string, CheckoutSuccessBody>();

  getStoredResponse(key: string): CheckoutSuccessBody | undefined {
    return this.store.get(key);
  }

  storeResponse(key: string, response: CheckoutSuccessBody): void {
    this.store.set(key, response);
  }
}
