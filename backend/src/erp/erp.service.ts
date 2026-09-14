import { Injectable, Logger } from "@nestjs/common";

export interface ErpOutcome {
  success: boolean;
}

export interface ErpProduct {
  id: string;
  name: string;
  priceCents: number;
  stock: number;
  imageUrl: string;
  imageAlt: string;
}

function erpBaseUrl(): string {
  return process.env.ERP_MOCK_URL || "http://localhost:4000";
}

@Injectable()
export class ErpService {
  private readonly logger = new Logger(ErpService.name);

  // Chamado uma vez, na inicialização do módulo de produtos (ver
  // ProductsModule), para carregar o catálogo do ERP — produto, preço e
  // estoque contábil são dados de propriedade do ERP, a loja só lê essa
  // base. Depois de carregado, a reserva/decremento de estoque continua
  // inteiramente local ao processo do backend (ver ProductsService):
  // nenhuma chamada síncrona ao ERP acontece durante um checkout.
  async fetchCatalog(): Promise<ErpProduct[]> {
    const url = `${erpBaseUrl()}/erp/products`;
    this.logger.log(`Buscando catálogo no erp-mock — url=${url}`);

    const res = await fetch(url);
    if (!res.ok) {
      this.logger.error(`erp-mock respondeu com erro ao buscar o catálogo — httpStatus=${res.status}`);
      throw new Error(`erp-mock respondeu ${res.status} ao buscar o catálogo`);
    }

    const data = (await res.json()) as { products: ErpProduct[] };
    this.logger.log(`Catálogo carregado do erp-mock — productCount=${data.products.length}`);
    return data.products;
  }

  async call(): Promise<ErpOutcome> {
    const baseUrl = erpBaseUrl();
    const mode = process.env.ERP_SIM_MODE || "random";
    const delayOverride = process.env.ERP_SIM_DELAY_MS;
    const start = Date.now();

    this.logger.debug(`Chamando erp-mock — url=${baseUrl}/erp/orders simMode=${mode}${delayOverride ? ` simDelayMs=${delayOverride}` : ""}`);

    const res = await fetch(`${baseUrl}/erp/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Erp-Simulate-Mode": mode,
        ...(delayOverride ? { "X-Erp-Simulate-Delay-Ms": delayOverride } : {}),
      },
      body: JSON.stringify({}),
    });
    const durationMs = Date.now() - start;

    if (!res.ok) {
      this.logger.warn(`erp-mock respondeu com erro, tratando como falha — httpStatus=${res.status} durationMs=${durationMs}`);
      return { success: false };
    }

    const data = (await res.json()) as { success: boolean };
    this.logger.debug(`erp-mock respondeu — httpStatus=${res.status} success=${data.success} durationMs=${durationMs}`);
    return { success: data.success };
  }
}
