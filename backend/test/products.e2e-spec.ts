import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";

describe("GET /products (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the seeded product catalog with available stock", async () => {
    const res = await request(app.getHttpServer()).get("/products");

    expect(res.status).toBe(200);
    expect(res.body.products.length).toBeGreaterThan(0);
    const first = res.body.products[0];
    expect(first).toHaveProperty("id");
    expect(first).toHaveProperty("name");
    expect(first).toHaveProperty("priceCents");
    expect(first).toHaveProperty("stock");
    expect(first).toHaveProperty("imageUrl");
    expect(first).toHaveProperty("imageAlt");
  });
});
