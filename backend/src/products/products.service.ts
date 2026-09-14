import { Injectable, Logger } from "@nestjs/common";

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  imageAlt: string;
}

interface Reservation {
  productId: string;
  quantity: number;
  status: "active" | "confirmed" | "released";
  expiresAt: number;
}

const RESERVATION_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  private readonly reservations = new Map<string, Reservation>();

  // O catálogo (produto, preço, estoque contábil, imagem) é carregado uma
  // única vez do ERP na inicialização (ver ProductsModule) — o ERP é o dono
  // desses dados, a loja só lê. A partir daqui, porém, a reserva e o débito
  // de estoque são inteiramente locais a este processo: nenhum método deste
  // serviço faz uma chamada de rede, o que é o que garante a operação
  // indivisível de checar-e-reservar (ver reserveStock).
  constructor(private readonly products: Product[]) {}

  listProducts(): Product[] {
    return this.products;
  }

  findProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  availableStock(productId: string): number {
    this.sweepExpired();
    const product = this.products.find((p) => p.id === productId);
    if (!product) return 0;
    return product.stock - this.reservedFor(productId);
  }

  reserveStock(orderId: string, productId: string, quantity: number): boolean {
    this.sweepExpired();
    const product = this.products.find((p) => p.id === productId);
    if (!product) {
      this.logger.warn(`Reserva recusada: produto inexistente — orderId=${orderId} productId=${productId}`);
      return false;
    }

    const available = product.stock - this.reservedFor(productId);
    if (available < quantity) {
      this.logger.warn(
        `Reserva recusada: estoque insuficiente — orderId=${orderId} productId=${productId} requested=${quantity} available=${available}`,
      );
      return false;
    }

    this.reservations.set(orderId, {
      productId,
      quantity,
      status: "active",
      expiresAt: Date.now() + RESERVATION_TTL_MS,
    });
    this.logger.log(
      `Estoque reservado — orderId=${orderId} productId=${productId} quantity=${quantity} remainingAvailable=${available - quantity} ttlMs=${RESERVATION_TTL_MS}`,
    );
    return true;
  }

  confirmReservation(orderId: string): void {
    const reservation = this.reservations.get(orderId);
    if (!reservation || reservation.status !== "active") {
      this.logger.debug(
        `confirmReservation ignorado (reserva inexistente ou não ativa; evita debitar estoque duas vezes) — orderId=${orderId} reservationStatus=${reservation?.status ?? "none"}`,
      );
      return;
    }

    const product = this.products.find((p) => p.id === reservation.productId);
    if (product) product.stock -= reservation.quantity;

    reservation.status = "confirmed";
    this.logger.log(
      `Reserva confirmada, estoque debitado — orderId=${orderId} productId=${reservation.productId} quantity=${reservation.quantity} newBaseStock=${product?.stock ?? "?"}`,
    );
  }

  releaseReservation(orderId: string): void {
    const reservation = this.reservations.get(orderId);
    if (!reservation || reservation.status !== "active") {
      this.logger.debug(
        `releaseReservation ignorado (reserva inexistente ou não ativa) — orderId=${orderId} reservationStatus=${reservation?.status ?? "none"}`,
      );
      return;
    }

    reservation.status = "released";
    this.logger.log(
      `Reserva liberada, estoque volta a ficar disponível — orderId=${orderId} productId=${reservation.productId} quantity=${reservation.quantity}`,
    );
  }

  private reservedFor(productId: string): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "active" && reservation.productId === productId) {
        total += reservation.quantity;
      }
    }
    return total;
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [orderId, reservation] of this.reservations.entries()) {
      if (reservation.status === "active" && reservation.expiresAt <= now) {
        reservation.status = "released";
        this.logger.warn(
          `Reserva expirou por TTL antes de ser confirmada ou liberada explicitamente — orderId=${orderId} productId=${reservation.productId} quantity=${reservation.quantity}`,
        );
      }
    }
  }
}
