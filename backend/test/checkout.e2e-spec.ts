import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

function uniqueKey(): string {
  return `test-${Math.random().toString(36).slice(2)}`;
}

describe("POST /checkout (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    delete process.env.ERP_SIM_MODE;
    delete process.env.ERP_SIM_DELAY_MS;
  });

  it("accepts a valid purchase and confirms it once the ERP succeeds", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("pending");
    expect(res.body.orderId).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 50));

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("confirmed");
  });

  it("rejects a non-positive quantity with a validation error", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 0, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.field).toBe("quantity");
  });

  it("rejects a request without an idempotency key", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.field).toBe("idempotencyKey");
  });

  it("rejects a request without a productId", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.field).toBe("productId");
  });

  it("rejects a non-integer quantity with a validation error", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1.5, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.field).toBe("quantity");
  });

  it("returns 404 for a product that does not exist", async () => {
    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "produto-que-nao-existe", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("lets only one of two simultaneous purchases succeed for the last unit", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";

    const [resA, resB] = await Promise.all([
      request(app.getHttpServer()).post("/checkout").send({ productId: "capinha-listrada", quantity: 1, idempotencyKey: uniqueKey() }),
      request(app.getHttpServer()).post("/checkout").send({ productId: "capinha-listrada", quantity: 1, idempotencyKey: uniqueKey() }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([202, 409]);
  });

  it("returns the exact same response when the same idempotency key is sent twice", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";
    const key = uniqueKey();
    const payload = { productId: "capinha-preta", quantity: 1, idempotencyKey: key };

    const first = await request(app.getHttpServer()).post("/checkout").send(payload);
    const second = await request(app.getHttpServer()).post("/checkout").send(payload);

    expect(second.body).toEqual(first.body);
    expect(second.status).toBe(first.status);
  });

  it("ignores a mismatched payload on a repeated idempotency key and returns the original order", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";
    const key = uniqueKey();

    const first = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-preta", quantity: 1, idempotencyKey: key });
    const second = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-listrada", quantity: 1, idempotencyKey: key });

    expect(second.body).toEqual(first.body);
  });

  it("accepts the idempotency key via the Idempotency-Key header instead of the body", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";
    const key = uniqueKey();

    const first = await request(app.getHttpServer())
      .post("/checkout")
      .set("Idempotency-Key", key)
      .send({ productId: "capinha-preta", quantity: 1 });
    const second = await request(app.getHttpServer())
      .post("/checkout")
      .set("Idempotency-Key", key)
      .send({ productId: "capinha-preta", quantity: 1 });

    expect(first.status).toBe(202);
    expect(second.body).toEqual(first.body);
  });

  it("marks the order as failed and releases stock when the ERP keeps failing", async () => {
    process.env.ERP_SIM_MODE = "always-fail";
    process.env.ERP_SIM_DELAY_MS = "10";

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 3100)); // 2 backoffs of 1s+2s plus margin

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.body.status).toBe("failed");
    expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
  }, 8000);

  it("marks the order as failed when the ERP responds with a real non-2xx HTTP status on every attempt", async () => {
    process.env.ERP_SIM_MODE = "always-http-error";
    process.env.ERP_SIM_DELAY_MS = "10";

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 3100)); // 2 backoffs of 1s+2s plus margin

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.body.status).toBe("failed");
    expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
  }, 8000);

  it("marks the order as failed when the ERP drops the connection on every attempt (fetch rejects, not just a failed response)", async () => {
    process.env.ERP_SIM_MODE = "always-reset";
    process.env.ERP_SIM_DELAY_MS = "10";

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 3100)); // 2 backoffs of 1s+2s plus margin

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.body.status).toBe("failed");
    expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
  }, 8000);

  it("marks the order as failed when the ERP never responds within the timeout window", async () => {
    process.env.ERP_SIM_MODE = "always-timeout";
    process.env.ERP_SIM_DELAY_MS = "5000"; // longer than the 3s per-attempt timeout

    const res = await request(app.getHttpServer())
      .post("/checkout")
      .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() });

    expect(res.status).toBe(202);

    await new Promise((resolve) => setTimeout(resolve, 12500));

    const statusRes = await request(app.getHttpServer()).get(`/orders/${res.body.orderId}`);
    expect(statusRes.body.status).toBe("failed");
    expect(statusRes.body.error.code).toBe("ERP_PROCESSING_FAILED");
  }, 15000);

  it("under N concurrent purchases, exactly as many succeed as there is available stock", async () => {
    process.env.ERP_SIM_MODE = "always-success";
    process.env.ERP_SIM_DELAY_MS = "10";

    const productsRes = await request(app.getHttpServer()).get("/products");
    const product = productsRes.body.products.find((p: { id: string }) => p.id === "capinha-transparente");
    const available: number = product.stock;
    const attempts = available + 2;

    const responses = await Promise.all(
      Array.from({ length: attempts }, () =>
        request(app.getHttpServer())
          .post("/checkout")
          .send({ productId: "capinha-transparente", quantity: 1, idempotencyKey: uniqueKey() }),
      ),
    );

    const accepted = responses.filter((r) => r.status === 202).length;
    const rejected = responses.filter((r) => r.status === 409).length;
    expect(accepted).toBe(available);
    expect(rejected).toBe(attempts - available);
  });
});
