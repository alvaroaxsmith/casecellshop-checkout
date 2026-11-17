import { Logger } from "@nestjs/common";
import {
  IdempotencyKeyReusedException,
  OutOfStockException,
  ProductNotFoundException,
  ValidationFailedException,
} from "../common/exceptions/app.exception";
import { ErpService } from "../erp/erp.service";
import { IdempotencyService } from "../idempotency/idempotency.service";
import { Order, OrdersService } from "../orders/orders.service";
import { ProductsService } from "../products/products.service";
import { CheckoutService } from "./checkout.service";
import { DEFAULT_SETTLEMENT_POLICY } from "./settlement-policy";

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
      lookup: jest.fn().mockReturnValue({ kind: "miss" }),
      storeResponse: jest.fn(),
    } as unknown as jest.Mocked<IdempotencyService>;
    erp = { call: jest.fn() } as unknown as jest.Mocked<ErpService>;
    service = new CheckoutService(products, orders, idempotency, erp, DEFAULT_SETTLEMENT_POLICY);
  });

  it("throws a validation error when no idempotency key is provided", async () => {
    await expect(service.checkout({ productId: "p1", quantity: 1 }, undefined)).rejects.toBeInstanceOf(
      ValidationFailedException,
    );
  });

  it("throws a not-found error when the product does not exist", async () => {
    products.findProduct.mockReturnValue(undefined);

    await expect(service.checkout({ productId: "does-not-exist", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(
      ProductNotFoundException,
    );
  });

  it("throws an out-of-stock error without creating an order when there is not enough stock", async () => {
    products.findProduct.mockReturnValue({
      id: "p1",
      name: "P",
      priceCents: 100,
      stock: 0,
      imageUrl: "",
      imageAlt: "",
    });
    products.availableStock.mockReturnValue(0);

    await expect(service.checkout({ productId: "p1", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(
      OutOfStockException,
    );
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(products.reserveStock).not.toHaveBeenCalled();
  });

  it("returns the cached response instead of creating a second order for a repeated key", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.lookup.mockReturnValue({ kind: "hit", response: cached });

    const result = await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

    expect(result).toBe(cached);
    expect(idempotency.lookup).toHaveBeenCalledWith("key-1", "p1:1");
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it("rejects a repeated key that arrives with a different purchase, without creating an order", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.lookup.mockReturnValue({ kind: "conflict", response: cached });

    await expect(service.checkout({ productId: "p2", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(
      IdempotencyKeyReusedException,
    );
    expect(orders.createOrder).not.toHaveBeenCalled();
  });

  it("retries three times with the documented backoff before releasing stock and marking the order failed", async () => {
    jest.useFakeTimers();
    try {
      products.findProduct.mockReturnValue({
        id: "p1",
        name: "P",
        priceCents: 100,
        stock: 1,
        imageUrl: "",
        imageAlt: "",
      });
      const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
      orders.createOrder.mockReturnValue(order);
      orders.getOrder.mockReturnValue(order);
      products.availableStock.mockReturnValue(1);
      products.reserveStock.mockReturnValue(true);
      erp.call.mockResolvedValue({ success: false });

      await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

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

  it("treats a rejected ERP call (network failure, not just an unsuccessful response) as a failed attempt", async () => {
    jest.useFakeTimers();
    try {
      products.findProduct.mockReturnValue({
        id: "p1",
        name: "P",
        priceCents: 100,
        stock: 1,
        imageUrl: "",
        imageAlt: "",
      });
      const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
      orders.createOrder.mockReturnValue(order);
      orders.getOrder.mockReturnValue(order);
      products.availableStock.mockReturnValue(1);
      products.reserveStock.mockReturnValue(true);
      erp.call.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

      await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

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

  it("confirms the order when the ERP call succeeds on the first attempt", async () => {
    jest.useFakeTimers();
    try {
      products.findProduct.mockReturnValue({
        id: "p1",
        name: "P",
        priceCents: 100,
        stock: 1,
        imageUrl: "",
        imageAlt: "",
      });
      const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
      orders.createOrder.mockReturnValue(order);
      orders.getOrder.mockReturnValue(order);
      products.availableStock.mockReturnValue(1);
      products.reserveStock.mockReturnValue(true);
      erp.call.mockResolvedValue({ success: true });

      await service.checkout({ productId: "p1", quantity: 1 }, "key-1");
      await jest.advanceTimersByTimeAsync(0);

      expect(erp.call).toHaveBeenCalledTimes(1);
      expect(products.confirmReservation).toHaveBeenCalledWith("ord_1");
      expect(orders.markConfirmed).toHaveBeenCalledWith("ord_1");
      expect(orders.markFailed).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("logs but does not crash when settleWithErp itself throws unexpectedly", async () => {
    jest.useFakeTimers();
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    try {
      products.findProduct.mockReturnValue({
        id: "p1",
        name: "P",
        priceCents: 100,
        stock: 1,
        imageUrl: "",
        imageAlt: "",
      });
      const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
      orders.createOrder.mockReturnValue(order);
      orders.getOrder.mockReturnValue(order);
      products.availableStock.mockReturnValue(1);
      products.reserveStock.mockReturnValue(true);
      erp.call.mockResolvedValue({ success: true });
      products.confirmReservation.mockImplementation(() => {
        throw new Error("unexpected failure inside confirmReservation");
      });

      await service.checkout({ productId: "p1", quantity: 1 }, "key-1");
      await jest.advanceTimersByTimeAsync(0);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Erro inesperado em settleWithErp"),
        expect.any(String),
      );
    } finally {
      errorSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
