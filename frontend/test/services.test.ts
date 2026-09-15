import { describe, it, expect, vi, afterEach } from "vitest";
import { postCheckout } from "../src/services/checkout.service";
import { fetchOrderStatus } from "../src/services/orders.service";
import { fetchProducts } from "../src/services/products.service";

// App.test.tsx mocks these modules wholesale (vi.mock) to drive the UI in
// isolation, so the actual bodies below — URL building, response parsing —
// never run there. These tests exercise the real functions directly against
// a mocked fetch, the same way backend/src/erp/erp.service.spec.ts is the
// one place that exercises ErpService's real HTTP-calling code.
describe("checkout.service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to /api/checkout and returns the status code alongside the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      json: async () => ({ orderId: "ord_000001", status: "pending", statusUrl: "/orders/ord_000001" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postCheckout({ productId: "capinha-preta", quantity: 1, idempotencyKey: "key-1" });

    expect(fetchMock).toHaveBeenCalledWith("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "capinha-preta", quantity: 1, idempotencyKey: "key-1" }),
    });
    expect(result).toEqual({
      statusCode: 202,
      body: { orderId: "ord_000001", status: "pending", statusUrl: "/orders/ord_000001" },
    });
  });
});

describe("orders.service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /api/orders/:id and returns the parsed order status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ orderId: "ord_000001", status: "confirmed" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchOrderStatus("ord_000001");

    expect(fetchMock).toHaveBeenCalledWith("/api/orders/ord_000001");
    expect(result).toEqual({ orderId: "ord_000001", status: "confirmed" });
  });
});

describe("products.service", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches /api/products and returns the products array from the response", async () => {
    const products = [{ id: "capinha-preta", name: "Capinha Preta Fosca", priceCents: 3990, stock: 5, imageUrl: "", imageAlt: "" }];
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ products }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchProducts();

    expect(fetchMock).toHaveBeenCalledWith("/api/products");
    expect(result).toEqual(products);
  });
});
