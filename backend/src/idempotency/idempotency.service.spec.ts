import { IdempotencyService } from "./idempotency.service";

describe("IdempotencyService", () => {
  it("returns undefined for a key that was never stored (miss)", () => {
    const service = new IdempotencyService();

    expect(service.getStoredResponse("never-seen")).toBeUndefined();
  });

  it("returns the exact stored response for a previously stored key (hit)", () => {
    const service = new IdempotencyService();
    const response = { orderId: "ord_000001", status: "pending" as const, statusUrl: "/orders/ord_000001" };

    service.storeResponse("key-1", response);

    expect(service.getStoredResponse("key-1")).toBe(response);
  });

  it("keeps responses for different keys independent of each other", () => {
    const service = new IdempotencyService();
    const responseA = { orderId: "ord_000001", status: "pending" as const, statusUrl: "/orders/ord_000001" };
    const responseB = { orderId: "ord_000002", status: "pending" as const, statusUrl: "/orders/ord_000002" };

    service.storeResponse("key-a", responseA);
    service.storeResponse("key-b", responseB);

    expect(service.getStoredResponse("key-a")).toBe(responseA);
    expect(service.getStoredResponse("key-b")).toBe(responseB);
  });
});
