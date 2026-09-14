import { CheckoutUseCase } from "./checkout.use-case";
import { ProductRepository } from "../../inventory/domain/product.repository";
import { StockService } from "../../inventory/domain/stock.service";
import { Product } from "../../inventory/domain/product.entity";
import { ProductNotFoundError } from "../../inventory/domain/errors/product-not-found.error";
import { OutOfStockError } from "../../inventory/domain/errors/out-of-stock.error";
import { OrderRepository } from "../../orders/domain/order.repository";
import { Order } from "../../orders/domain/order.entity";
import { IdempotencyService } from "../../idempotency/idempotency.service";
import { ErpGateway } from "../../erp/domain/erp-gateway";
import { InvalidInputError } from "../../shared/domain/errors/invalid-input.error";

describe("CheckoutUseCase", () => {
  let products: jest.Mocked<ProductRepository>;
  let stock: jest.Mocked<StockService>;
  let orders: jest.Mocked<OrderRepository>;
  let idempotency: jest.Mocked<IdempotencyService>;
  let erp: jest.Mocked<ErpGateway>;
  let useCase: CheckoutUseCase;

  beforeEach(() => {
    products = { findById: jest.fn(), findAll: jest.fn(), save: jest.fn() };
    stock = {
      reserveStock: jest.fn(),
      confirmReservation: jest.fn(),
      releaseReservation: jest.fn(),
      availableStock: jest.fn(),
    } as unknown as jest.Mocked<StockService>;
    orders = { create: jest.fn(), findById: jest.fn(), save: jest.fn() };
    idempotency = { getStoredResponse: jest.fn(), storeResponse: jest.fn() } as unknown as jest.Mocked<IdempotencyService>;
    erp = { call: jest.fn() };
    useCase = new CheckoutUseCase(products, stock, orders, idempotency, erp);
  });

  it("throws a validation error when no idempotency key is provided", async () => {
    await expect(useCase.execute({ productId: "p1", quantity: 1 } as any, undefined)).rejects.toBeInstanceOf(
      InvalidInputError,
    );
  });

  it("throws a not-found error when the product does not exist", async () => {
    products.findById.mockReturnValue(undefined);

    await expect(useCase.execute({ productId: "does-not-exist", quantity: 1 } as any, "key-1")).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it("throws an out-of-stock error and marks the order failed when the reservation fails", async () => {
    products.findById.mockReturnValue(new Product("p1", "P", 100, 0));
    const order = new Order("ord_1", "p1", 1, Date.now());
    orders.create.mockReturnValue(order);
    stock.reserveStock.mockReturnValue(false);

    await expect(useCase.execute({ productId: "p1", quantity: 1 } as any, "key-1")).rejects.toBeInstanceOf(OutOfStockError);
    expect(order.status).toBe("failed");
    expect(orders.save).toHaveBeenCalledWith(order);
  });

  it("returns the cached response instead of creating a second order for a repeated key", async () => {
    const cached = { orderId: "ord_1", status: "pending" as const, statusUrl: "/orders/ord_1" };
    idempotency.getStoredResponse.mockReturnValue(cached);

    const result = await useCase.execute({ productId: "p1", quantity: 1 } as any, "key-1");

    expect(result).toBe(cached);
    expect(orders.create).not.toHaveBeenCalled();
  });
});
