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
    products.findProduct.mockReturnValue(undefined);

    await expect(service.checkout({ productId: "does-not-exist", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(
      ProductNotFoundException,
    );
  });

  it("throws an out-of-stock error and marks the order failed when the reservation fails", async () => {
    products.findProduct.mockReturnValue({ id: "p1", name: "P", priceCents: 100, stock: 0, imageUrl: "", imageAlt: "" });
    const order: Order = { id: "ord_1", productId: "p1", quantity: 1, status: "pending", createdAt: Date.now() };
    orders.createOrder.mockReturnValue(order);
    products.reserveStock.mockReturnValue(false);

    await expect(service.checkout({ productId: "p1", quantity: 1 }, "key-1")).rejects.toBeInstanceOf(OutOfStockException);
    expect(orders.markFailed).toHaveBeenCalledWith("ord_1", "OUT_OF_STOCK", expect.any(String));
  });

  it("returns the cached response instead of creating a second order for a repeated key", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.getStoredResponse.mockReturnValue(cached);

    const result = await service.checkout({ productId: "p1", quantity: 1 }, "key-1");

    expect(result).toBe(cached);
    expect(orders.createOrder).not.toHaveBeenCalled();
  });
});
