import request from "supertest";
import { app } from "../src/app";

describe("POST /erp/orders", () => {
  it("returns success when mode is always-success", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-success")
      .set("X-Erp-Simulate-Delay-Ms", "10")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns failure when mode is always-fail", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-fail")
      .set("X-Erp-Simulate-Delay-Ms", "10")
      .send({});

    expect(res.body.success).toBe(false);
  });

  it("eventually returns success in always-timeout mode, honoring the delay header", async () => {
    const res = await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-timeout")
      .set("X-Erp-Simulate-Delay-Ms", "50")
      .send({});

    expect(res.body.success).toBe(true);
  }, 2000);

  it("honors the requested delay before responding", async () => {
    const start = Date.now();
    await request(app)
      .post("/erp/orders")
      .set("X-Erp-Simulate-Mode", "always-success")
      .set("X-Erp-Simulate-Delay-Ms", "300")
      .send({});

    expect(Date.now() - start).toBeGreaterThanOrEqual(280);
  });

  it("defaults to a well-formed random response when no mode header is sent", async () => {
    const res = await request(app).post("/erp/orders").set("X-Erp-Simulate-Delay-Ms", "10").send({});
    expect(typeof res.body.success).toBe("boolean");
  });
});

describe("GET /health", () => {
  it("responds ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
