import { Injectable } from "@nestjs/common";
import { ErpGateway, ErpOutcome } from "../domain/erp-gateway";

@Injectable()
export class HttpErpGateway implements ErpGateway {
  async call(): Promise<ErpOutcome> {
    const baseUrl = process.env.ERP_MOCK_URL || "http://localhost:4000";
    const mode = process.env.ERP_SIM_MODE || "random";
    const delayOverride = process.env.ERP_SIM_DELAY_MS;

    const res = await fetch(`${baseUrl}/erp/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Erp-Simulate-Mode": mode,
        ...(delayOverride ? { "X-Erp-Simulate-Delay-Ms": delayOverride } : {}),
      },
      body: JSON.stringify({}),
    });

    if (!res.ok) return { success: false };

    const data = (await res.json()) as { success: boolean };
    return { success: data.success };
  }
}
