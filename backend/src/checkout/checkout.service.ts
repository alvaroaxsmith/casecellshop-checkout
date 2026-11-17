import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  OutOfStockException,
  ProductNotFoundException,
  ValidationFailedException,
} from "../common/exceptions/app.exception";
import { ErpOutcome, ErpService } from "../erp/erp.service";
import { CheckoutSuccessBody, IdempotencyService } from "../idempotency/idempotency.service";
import { OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { CheckoutDto } from "./checkout.dto";
import { SETTLEMENT_POLICY, type SettlementPolicy } from "./settlement-policy";

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly products: ProductsService,
    private readonly orders: OrdersService,
    private readonly idempotency: IdempotencyService,
    private readonly erp: ErpService,
    @Inject(SETTLEMENT_POLICY) private readonly policy: SettlementPolicy,
  ) {}

  async checkout(dto: CheckoutDto, headerKey?: string, requestId?: string): Promise<CheckoutSuccessBody> {
    const idempotencyKey = headerKey ?? dto.idempotencyKey;
    const ctx = `requestId=${requestId ?? "-"} productId=${dto.productId} quantity=${dto.quantity} idempotencyKey=${idempotencyKey ?? "-"}`;
    this.logger.log(`Checkout recebido — ${ctx}`);

    if (!idempotencyKey) {
      this.logger.warn(
        `Checkout rejeitado: idempotencyKey ausente (nem no body, nem no header Idempotency-Key) — ${ctx}`,
      );
      throw new ValidationFailedException("idempotencyKey é obrigatório.", "idempotencyKey");
    }

    const cached = this.idempotency.getStoredResponse(idempotencyKey);
    if (cached) {
      this.logger.log(
        `Checkout idempotente: resposta anterior reaproveitada, nada foi reprocessado — orderId=${cached.orderId} ${ctx}`,
      );
      return cached;
    }

    const product = this.products.findProduct(dto.productId);
    if (!product) {
      this.logger.warn(`Checkout rejeitado: produto inexistente — ${ctx}`);
      throw new ProductNotFoundException();
    }

    // Conferir, criar o pedido e reservar rodam sem nenhum `await` entre si: nenhuma
    // outra requisição se intercala, então a reserva logo abaixo nunca encontra
    // menos estoque do que esta conferência viu. Conferir antes de criar evita
    // deixar um pedido `failed` que o cliente (que recebeu 409) nunca vai consultar.
    const available = this.products.availableStock(dto.productId);
    if (available < dto.quantity) {
      this.logger.warn(`Checkout rejeitado: sem estoque suficiente — available=${available} ${ctx}`);
      throw new OutOfStockException();
    }

    const order = this.orders.createOrder(dto.productId, dto.quantity);
    if (!this.products.reserveStock(order.id, dto.productId, dto.quantity)) {
      throw new Error(`Invariante violada: reserva recusada logo após a conferência de estoque — orderId=${order.id}`);
    }

    const body: CheckoutSuccessBody = { orderId: order.id, status: "pending", statusUrl: `/orders/${order.id}` };
    this.idempotency.storeResponse(idempotencyKey, body);
    this.logger.log(
      `Checkout aceito, status=pending; liquidação com o ERP inicia em segundo plano — orderId=${order.id} ${ctx}`,
    );

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

    const { timeoutMs, maxAttempts, backoffMs } = this.policy;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.logger.log(`Chamando o ERP — orderId=${orderId} attempt=${attempt}/${maxAttempts} timeoutMs=${timeoutMs}`);
      let outcome: ErpOutcome;
      try {
        outcome = await this.callErpWithTimeout(timeoutMs);
      } catch (err) {
        this.logger.warn(
          `Chamada ao ERP rejeitou (tratada como falha desta tentativa) — orderId=${orderId} attempt=${attempt}/${maxAttempts} reason=${err instanceof Error ? err.message : String(err)}`,
        );
        outcome = { success: false };
      }
      if (outcome.success) {
        this.products.confirmReservation(orderId);
        this.orders.markConfirmed(orderId);
        this.logger.log(`ERP confirmou o pedido — orderId=${orderId} attempt=${attempt}/${maxAttempts}`);
        return;
      }
      this.logger.warn(
        `Tentativa de liquidação falhou (ERP indisponível, lento ou recusou) — orderId=${orderId} attempt=${attempt}/${maxAttempts}`,
      );
      if (attempt < maxAttempts) {
        const backoff = backoffMs[Math.min(attempt - 1, backoffMs.length - 1)] ?? 0;
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
    this.logger.error(
      `Pedido falhou definitivamente após esgotar as tentativas; estoque liberado — orderId=${orderId} attempts=${maxAttempts}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Disputa a chamada ao ERP contra um timer; o timer é cancelado assim que a chamada termina. */
  private async callErpWithTimeout(ms: number): Promise<ErpOutcome> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<ErpOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ success: false }), ms);
    });
    try {
      return await Promise.race([this.erp.call(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
