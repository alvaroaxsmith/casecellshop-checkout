import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { SETTLEMENT_POLICY, type SettlementPolicy } from "../../src/checkout/settlement-policy";

/**
 * Mesma lógica de tentativas da produção, em escala menor: os testes de falha do ERP
 * exercitam timeout, retry e backoff reais em ~1s em vez de ~12s.
 */
export const TEST_SETTLEMENT_POLICY: SettlementPolicy = { timeoutMs: 300, maxAttempts: 3, backoffMs: [100, 200] };

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SETTLEMENT_POLICY)
    .useValue(TEST_SETTLEMENT_POLICY)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  // Binds a real port once instead of letting supertest open/close an
  // ephemeral listener per request — needed for tests that fire more than a
  // couple of truly concurrent requests against the same server.
  await app.listen(0);
  return app;
}

/** Consulta `GET /orders/:id` até o pedido sair de `pending`, ou falha após `timeoutMs`. */
export async function waitForSettledOrder(
  app: INestApplication,
  orderId: string,
  timeoutMs = 5000,
): Promise<{ status: string; error?: { code: string; message: string } }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer()).get(`/orders/${orderId}`);
    if (res.body.status !== "pending") return res.body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Pedido ${orderId} continuou pending por mais de ${timeoutMs}ms`);
}
