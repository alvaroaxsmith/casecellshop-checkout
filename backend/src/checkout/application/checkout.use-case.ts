import { Inject, Injectable } from "@nestjs/common";
import { PRODUCT_REPOSITORY, ProductRepository } from "../../inventory/domain/product.repository";
import { StockService } from "../../inventory/domain/stock.service";
import { ProductNotFoundError } from "../../inventory/domain/errors/product-not-found.error";
import { OutOfStockError } from "../../inventory/domain/errors/out-of-stock.error";
import { ORDER_REPOSITORY, OrderRepository } from "../../orders/domain/order.repository";
import { IdempotencyService, CheckoutSuccessBody } from "../../idempotency/idempotency.service";
import { ERP_GATEWAY, ErpGateway } from "../../erp/domain/erp-gateway";
import { InvalidInputError } from "../../shared/domain/errors/invalid-input.error";
import { CheckoutRequestDto } from "../dto/checkout-request.dto";

const ERP_TIMEOUT_MS = 3000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 2000];

@Injectable()
export class CheckoutUseCase {
  constructor(
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    private readonly stock: StockService,
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    private readonly idempotency: IdempotencyService,
    @Inject(ERP_GATEWAY) private readonly erp: ErpGateway,
  ) {}

  async execute(dto: CheckoutRequestDto, headerKey?: string): Promise<CheckoutSuccessBody> {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;
    if (!idempotencyKey) {
      throw new InvalidInputError("idempotencyKey é obrigatório.", "idempotencyKey");
    }

    const cached = this.idempotency.getStoredResponse(idempotencyKey);
    if (cached) return cached;

    const product = this.products.findById(dto.productId);
    if (!product) throw new ProductNotFoundError();

    const order = this.orders.create(dto.productId, dto.quantity);
    const reserved = this.stock.reserveStock(order.id, dto.productId, dto.quantity);
    if (!reserved) {
      order.fail("OUT_OF_STOCK", "Este produto está esgotado no momento.");
      this.orders.save(order);
      throw new OutOfStockError();
    }

    const body: CheckoutSuccessBody = { orderId: order.id, status: "pending", statusUrl: `/orders/${order.id}` };
    this.idempotency.storeResponse(idempotencyKey, body);

    void this.settleWithErp(order.id);

    return body;
  }

  private async settleWithErp(orderId: string): Promise<void> {
    const order = this.orders.findById(orderId);
    if (!order) return;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const outcome = await Promise.race([this.erp.call(), this.timeoutAfter(ERP_TIMEOUT_MS)]);
      if (outcome.success) {
        this.stock.confirmReservation(orderId);
        order.confirm();
        this.orders.save(order);
        return;
      }
      if (attempt < MAX_ATTEMPTS) {
        await this.sleep(BACKOFF_MS[attempt - 1]);
      }
    }
    this.stock.releaseReservation(orderId);
    order.fail("ERP_PROCESSING_FAILED", "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.");
    this.orders.save(order);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeoutAfter(ms: number): Promise<{ success: false }> {
    return new Promise((resolve) => setTimeout(() => resolve({ success: false }), ms));
  }
}
