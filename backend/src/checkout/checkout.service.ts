import { Injectable } from "@nestjs/common";
import { ProductsService } from "../products/products.service";
import { OrdersService } from "../orders/orders.service";
import { IdempotencyService, CheckoutSuccessBody } from "../idempotency/idempotency.service";
import { ErpService, ErpOutcome } from "../erp/erp.service";
import { CheckoutDto } from "./checkout.dto";
import {
  OutOfStockException,
  ProductNotFoundException,
  ValidationFailedException,
} from "../common/exceptions/app.exception";

const ERP_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];

@Injectable()
export class CheckoutService {
  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly erp: ErpService,
  ) {}

  async checkout(dto: CheckoutDto, headerKey?: string): Promise<CheckoutSuccessBody> {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;
    if (!idempotencyKey) {
      throw new ValidationFailedException("idempotencyKey é obrigatório.", "idempotencyKey");
    }

    const cached = this.idempotency.getStoredResponse(idempotencyKey);
    if (cached) return cached;

    const product = this.products.findProduct(dto.productId);
    if (!product) throw new ProductNotFoundException();

    const order = this.orders.createOrder(dto.productId, dto.quantity);
    const reserved = this.products.reserveStock(order.id, dto.productId, dto.quantity);
    if (!reserved) {
      this.orders.markFailed(order.id, "OUT_OF_STOCK", "Este produto está esgotado no momento.");
      throw new OutOfStockException();
    }

    const body: CheckoutSuccessBody = { orderId: order.id, status: "pending", statusUrl: `/orders/${order.id}` };
    this.idempotency.storeResponse(idempotencyKey, body);

    void this.settleWithErp(order.id).catch(() => {
      // settleWithErp already turns every failure mode (including a rejected
      // this.erp.call()) into a terminal "failed" order — this .catch() only
      // exists as a last-resort net so a bug there can never surface as an
      // unhandled rejection and crash the process.
    });

    return body;
  }

  private async settleWithErp(orderId: string): Promise<void> {
    const order = this.orders.getOrder(orderId);
    if (!order) return;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let outcome: ErpOutcome;
      try {
        outcome = await Promise.race([this.erp.call(), this.timeoutAfter(ERP_TIMEOUT_MS)]);
      } catch {
        outcome = { success: false };
      }
      if (outcome.success) {
        this.products.confirmReservation(orderId);
        this.orders.markConfirmed(orderId);
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleep(BACKOFF_MS[attempt - 1] ?? 1000);
      }
    }
    this.products.releaseReservation(orderId);
    this.orders.markFailed(
      orderId,
      "ERP_PROCESSING_FAILED",
      "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.",
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeoutAfter(ms: number): Promise<{ success: false }> {
    return new Promise((resolve) => setTimeout(() => resolve({ success: false }), ms));
  }
}
