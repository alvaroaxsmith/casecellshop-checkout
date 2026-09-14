import { Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly erp: ErpService,
  ) {}

  // requestId correlaciona estas linhas com a entrada/saída HTTP logada pelo
  // RequestLoggerMiddleware. A partir do momento em que um pedido existe,
  // orderId passa a ser a chave de correlação — inclusive na liquidação
  // assíncrona com o ERP, que roda bem depois da resposta HTTP já ter sido
  // enviada e por isso não tem mais um requestId "ativo" a que se prender.
  async checkout(dto: CheckoutDto, headerKey?: string, requestId?: string): Promise<CheckoutSuccessBody> {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;
    const ctx = `requestId=${requestId ?? "-"} productId=${dto.productId} quantity=${dto.quantity} idempotencyKey=${idempotencyKey ?? "-"}`;
    this.logger.log(`Checkout recebido — ${ctx}`);

    if (!idempotencyKey) {
      this.logger.warn(`Checkout rejeitado: idempotencyKey ausente (nem no body, nem no header Idempotency-Key) — ${ctx}`);
      throw new ValidationFailedException("idempotencyKey é obrigatório.", "idempotencyKey");
    }

    const cached = this.idempotency.getStoredResponse(idempotencyKey);
    if (cached) {
      this.logger.log(`Checkout idempotente: resposta anterior reaproveitada, nada foi reprocessado — orderId=${cached.orderId} ${ctx}`);
      return cached;
    }

    const product = this.products.findProduct(dto.productId);
    if (!product) {
      this.logger.warn(`Checkout rejeitado: produto inexistente — ${ctx}`);
      throw new ProductNotFoundException();
    }

    const order = this.orders.createOrder(dto.productId, dto.quantity);
    const reserved = this.products.reserveStock(order.id, dto.productId, dto.quantity);
    if (!reserved) {
      this.orders.markFailed(order.id, "OUT_OF_STOCK", "Este produto está esgotado no momento.");
      this.logger.warn(`Checkout rejeitado: sem estoque suficiente — orderId=${order.id} ${ctx}`);
      throw new OutOfStockException();
    }

    const body: CheckoutSuccessBody = { orderId: order.id, status: "pending", statusUrl: `/orders/${order.id}` };
    this.idempotency.storeResponse(idempotencyKey, body);
    this.logger.log(`Checkout aceito, status=pending; liquidação com o ERP inicia em segundo plano — orderId=${order.id} ${ctx}`);

    void this.settleWithErp(order.id).catch((err: unknown) => {
      // settleWithErp already turns every failure mode (including a rejected
      // this.erp.call()) into a terminal "failed" order — this .catch() only
      // exists as a last-resort net so a bug there can never surface as an
      // unhandled rejection and crash the process.
      this.logger.error(
        `Erro inesperado em settleWithErp — isso não deveria acontecer, pois settleWithErp trata suas próprias falhas — orderId=${order.id}`,
        err instanceof Error ? err.stack : String(err),
      );
    });

    return body;
  }

  private async settleWithErp(orderId: string): Promise<void> {
    const order = this.orders.getOrder(orderId);
    if (!order) return;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      this.logger.log(`Chamando o ERP — orderId=${orderId} attempt=${attempt}/${MAX_ATTEMPTS} timeoutMs=${ERP_TIMEOUT_MS}`);
      let outcome: ErpOutcome;
      try {
        outcome = await Promise.race([this.erp.call(), this.timeoutAfter(ERP_TIMEOUT_MS)]);
      } catch (err) {
        this.logger.warn(
          `Chamada ao ERP rejeitou (tratada como falha desta tentativa) — orderId=${orderId} attempt=${attempt}/${MAX_ATTEMPTS} reason=${err instanceof Error ? err.message : String(err)}`,
        );
        outcome = { success: false };
      }
      if (outcome.success) {
        this.products.confirmReservation(orderId);
        this.orders.markConfirmed(orderId);
        this.logger.log(`ERP confirmou o pedido — orderId=${orderId} attempt=${attempt}/${MAX_ATTEMPTS}`);
        return;
      }
      this.logger.warn(
        `Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=${orderId} attempt=${attempt}/${MAX_ATTEMPTS}`,
      );
      if (attempt < MAX_ATTEMPTS) {
        const backoff = BACKOFF_MS[attempt - 1] ?? 1000;
        this.logger.log(`Aguardando antes da próxima tentativa — orderId=${orderId} backoffMs=${backoff}`);
        await this.sleep(backoff);
      }
    }
    this.products.releaseReservation(orderId);
    this.orders.markFailed(
      orderId,
      "ERP_PROCESSING_FAILED",
      "Não conseguimos concluir seu pedido agora. Tente novamente em instantes.",
    );
    this.logger.error(`Pedido falhou definitivamente após esgotar as tentativas; estoque liberado — orderId=${orderId} attempts=${MAX_ATTEMPTS}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private timeoutAfter(ms: number): Promise<{ success: false }> {
    return new Promise((resolve) => setTimeout(() => resolve({ success: false }), ms));
  }
}
