import { CheckoutService } from "./checkout.service";
import { ProductsService } from "../products/products.service";
import { OrdersService, Order } from "../orders/orders.service";
import { IdempotencyService } from "../idempotency/idempotency.service";
import { ErpService } from "../erp/erp.service";
import { OutOfStockException, ProductNotFoundException, ValidationFailedException } from "../common/exceptions/app.exception";

describe("CheckoutService", () => {
  let products: jest.Mocked<ProductsService>;
  let orders: jest.Mocked<OrdersService>;
  let idempotency: jest.Mocked<IdempotencyService>;
  let erp: jest.Mocked<ErpService>;
  let service: CheckoutService;

  beforeEach(() => {
    products = {
      listProducts: jest.fn(),
      findProduct: jest.fn(),
      availableStock: jest.fn(),
      reserveStock: jest.fn(),
      confirmReservation: jest.fn(),
      releaseReservation: jest.fn(),
    } as unknown as jest.Mocked<ProductsService>;
    orders = {
      createOrder: jest.fn(),
      getOrder: jest.fn(),
      markConfirmed: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<OrdersService>;
    idempotency = {
      getStoredResponse: jest.fn(),
      storeResponse: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;
    erp = { call: jest.fn() } as unknown as jest.Mocked<ErpService>;
    service = new CheckoutService(products, orders, idempotency, erp);
  });

  it("throws a validation error when no idempotency key is provided", async () => {
    await expect(service.checkout({ productId: "p1", quantity: 1 }, undefined)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
  });

  it("throws a not-found error when the product does not exist", async () => {
    products.findProduct.mockResolvedValue(undefined);

    await expect(service.checkout({ productId: "does-not-exist", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(
      ProductNotFoundException,
    );
  });

  it("throws an out-of-stock error and marks the order failed when the reservation fails", async () => {
    products.findProduct.mockResolvedValue({ id: "p1", name: "P", priceCents: 100, imageUrl: "", imageAlt: "" });
    const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
    orders.createOrder.mockResolvedValue(order);
    products.reserveStock.mockResolvedValue(false);

    await expect(service.checkout({ productId: "p1", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(OutOfStockException);
    expect(orders.markFailed).toHaveBeenCalledWith("ord_1", "OUT_OF_STOCK", expect.any(String));
  });

  it("returns the cached response instead of creating a second order for a repeated key", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.getStoredResponse.mockResolvedValue(cached);

    const result = await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

    expect(result).toBe(cached);
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it("retries three times with the documented backoff before releasing stock and marking the order failed", async () => {
    jest.useFakeTimers();
    try {
      products.findProduct.mockResolvedValue({ id: "p1", name: "P", priceCents: 100, imageUrl: "", imageAlt: "" });
      const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
      orders.createOrder.mockResolvedValue(order);
      orders.getOrder.mockResolvedValue(order);
      products.reserveStock.mockResolvedValue(true);
      erp.call.mockResolvedValue({ success: false });

      await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

      // Attempt 1 resolves immediately (mocked), then the two documented
      // backoffs (1s, 2s) have to elapse for attempts 2 and 3 to fire.
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(1000);
      await jest.advanceTimersByTimeAsync(2000);
      await jest.advanceTimersByTimeAsync(0);

      expect(erp.call).toHaveBeenCalledTimes(3);
      expect(products.releaseReservation).toHaveBeenCalledWith("ord_1");
      expect(orders.markFailed).toHaveBeenCalledWith("ord_1", "ERP_PROCESSING_FAILED", expect.any(String));
    } finally {
      jest.useRealTimers();
    }
  });
});
