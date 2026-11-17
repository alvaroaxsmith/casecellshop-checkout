import { IDEMPOTENCY_TTL_MS, IdempotencyService } from "./idempotency.service";

const responseA = { orderId: "ord_000001", status: "pending" as const, statusUrl: "/orders/ord_000001" };
const responseB = { orderId: "ord_000002", status: "pending" as const, statusUrl: "/orders/ord_000002" };

describe("IdempotencyService", () => {
  it("returns a miss for a key that was never stored", () => {
    const service = new IdempotencyService();

    expect(service.lookup("never-seen", "p1:1")).toEqual({ kind: "miss" });
  });

  it("returns a hit with the exact stored response for the same key and the same content", () => {
    const service = new IdempotencyService();
    service.storeResponse("key-1", "p1:1", responseA);

    const result = service.lookup("key-1", "p1:1");

    expect(result.kind).toBe("hit");
    expect(result.kind === "hit" && result.response).toBe(responseA);
  });

  it("returns a conflict when the same key arrives with different content", () => {
    const service = new IdempotencyService();
    service.storeResponse("key-1", "p1:1", responseA);

    expect(service.lookup("key-1", "p2:1")).toEqual({ kind: "conflict", response: responseA });
  });

  it("keeps responses for different keys independent of each other", () => {
    const service = new IdempotencyService();
    service.storeResponse("key-a", "p1:1", responseA);
    service.storeResponse("key-b", "p1:1", responseB);

    expect(service.lookup("key-a", "p1:1")).toEqual({ kind: "hit", response: responseA });
    expect(service.lookup("key-b", "p1:1")).toEqual({ kind: "hit", response: responseB });
  });

  describe("TTL", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it("still recognises a key right before it expires", () => {
      const service = new IdempotencyService();
      service.storeResponse("key-1", "p1:1", responseA);

      jest.advanceTimersByTime(IDEMPOTENCY_TTL_MS - 1);

      expect(service.lookup("key-1", "p1:1")).toEqual({ kind: "hit", response: responseA });
    });

    it("forgets a key once its TTL has passed, so it can be used for a new purchase", () => {
      const service = new IdempotencyService();
      service.storeResponse("key-1", "p1:1", responseA);

      jest.advanceTimersByTime(IDEMPOTENCY_TTL_MS);

      expect(service.lookup("key-1", "p2:1")).toEqual({ kind: "miss" });
    });

    it("expires only the keys whose TTL has passed", () => {
      const service = new IdempotencyService();
      service.storeResponse("old", "p1:1", responseA);
      jest.advanceTimersByTime(IDEMPOTENCY_TTL_MS / 2);
      service.storeResponse("new", "p1:1", responseB);

      jest.advanceTimersByTime(IDEMPOTENCY_TTL_MS / 2);

      expect(service.lookup("old", "p1:1")).toEqual({ kind: "miss" });
      expect(service.lookup("new", "p1:1")).toEqual({ kind: "hit", response: responseB });
    });
  });
});
