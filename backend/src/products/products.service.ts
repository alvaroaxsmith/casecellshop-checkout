import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../redis/redis.service";
import { ErpService } from "../erp/erp.service";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  imageUrl: string;
  imageAlt: string;
}

const CATALOG_CACHE_KEY = "catalog:products";
const CATALOG_TTL_SECONDS = 30;
const RESERVATION_TTL_SECONDS = 120;

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly erp: ErpService,
  ) {}

  // Aquece o cache no boot para a primeira requisição não pagar o custo de
  // um cache-miss, e para preservar o mesmo comportamento de "falha ao
  // iniciar se o erp-mock estiver fora do ar" que a versão em memória tem —
  // o Nest aguarda onModuleInit antes de começar a aceitar requisições.
  async onModuleInit(): Promise<void> {
    await this.refreshCatalog();
  }

  async listProducts(): Promise<Product[]> {
    return this.getCatalog();
  }

  async findProduct(id: string): Promise<Product | undefined> {
    const catalog = await this.getCatalog();
    return catalog.find((p) => p.id === id);
  }

  async availableStock(productId: string): Promise<number> {
    const base = await this.redis.client.get(`product:stock:${productId}`);
    if (base === null) return 0;
    const reserved = await this.reservedFor(productId);
    return Number(base) - reserved;
  }

  // Indivisível porque o script Lua roda inteiro sem interrupção de outro
  // comando no mesmo Redis (ADR-002) — a mesma garantia que a versão em
  // memória tinha por rodar síncrona dentro do event loop do Node, agora
  // sustentada pelo Redis em vez do processo único do backend.
  async reserveStock(orderId: string, productId: string, quantity: number): Promise<boolean> {
    const available = await this.redis.client.reserveStock(
      `product:stock:${productId}`,
      `product:reservations:${productId}`,
      quantity,
      RESERVATION_TTL_SECONDS,
      orderId,
      productId,
    );

    if (available === -1) {
      this.logger.warn(
        `Reserva recusada: estoque base ainda não semeado — orderId=${orderId} productId=${productId}`,
      );
      return false;
    }
    if (available < quantity) {
      this.logger.warn(
        `Reserva recusada: estoque insuficiente — orderId=${orderId} productId=${productId} requested=${quantity} available=${available}`,
      );
      return false;
    }

    this.logger.log(
      `Estoque reservado — orderId=${orderId} productId=${productId} quantity=${quantity} remainingAvailable=${available - quantity} ttlSeconds=${RESERVATION_TTL_SECONDS}`,
    );
    return true;
  }

  async confirmReservation(orderId: string): Promise<void> {
    const changed = await this.redis.client.confirmReservation(`reservation:${orderId}`, orderId);
    if (changed === 0) {
      this.logger.debug(
        `confirmReservation ignorado (reserva inexistente ou não ativa; evita debitar estoque duas vezes) — orderId=${orderId}`,
      );
      return;
    }
    this.logger.log(`Reserva confirmada, estoque debitado — orderId=${orderId}`);
  }

  async releaseReservation(orderId: string): Promise<void> {
    const changed = await this.redis.client.releaseReservation(`reservation:${orderId}`, orderId);
    if (changed === 0) {
      this.logger.debug(`releaseReservation ignorado (reserva inexistente ou não ativa) — orderId=${orderId}`);
      return;
    }
    this.logger.log(`Reserva liberada, estoque volta a ficar disponível — orderId=${orderId}`);
  }

  private async reservedFor(productId: string): Promise<number> {
    const hash = await this.redis.client.hgetall(`product:reservations:${productId}`);
    let total = 0;
    for (const [orderId, quantity] of Object.entries(hash)) {
      const stillActive = await this.redis.client.exists(`reservation:${orderId}`);
      if (stillActive) total += Number(quantity);
    }
    return total;
  }

  private async getCatalog(): Promise<Product[]> {
    const cached = await this.redis.client.get(CATALOG_CACHE_KEY);
    if (cached) return JSON.parse(cached) as Product[];

    this.logger.debug(`Cache de catálogo vazio ou expirado, buscando no erp-mock — key=${CATALOG_CACHE_KEY}`);
    return this.refreshCatalog();
  }

  private async refreshCatalog(): Promise<Product[]> {
    const erpProducts = await this.erp.fetchCatalog();
    const catalog: Product[] = erpProducts.map((p) => ({
      id: p.id,
      name: p.name,
      priceCents: p.priceCents,
      imageUrl: p.imageUrl,
      imageAlt: p.imageAlt,
    }));

    await this.redis.client.set(CATALOG_CACHE_KEY, JSON.stringify(catalog), "EX", CATALOG_TTL_SECONDS);

    // NX: só grava se a chave ainda não existir. O erp-mock é estático (não
    // sabe de pedidos que a loja já confirmou), então sobrescrever a cada
    // refresh apagaria um débito local de estoque com o valor "de fábrica"
    // do ERP — ver ADR-009 em referencias/decisoes-tecnicas.md. Sem TTL:
    // esse valor só muda por confirmReservation, nunca deve expirar sozinho.
    for (const p of erpProducts) {
      await this.redis.client.set(`product:stock:${p.id}`, String(p.stock), "NX");
    }

    this.logger.log(
      `Catálogo atualizado a partir do erp-mock — productCount=${catalog.length} ttlSeconds=${CATALOG_TTL_SECONDS}`,
    );
    return catalog;
  }
}
