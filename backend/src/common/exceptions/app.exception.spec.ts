import { HttpStatus } from "@nestjs/common";
import {
  OrderNotFoundException,
  OutOfStockException,
  ProductNotFoundException,
  ValidationFailedException,
} from "./app.exception";

describe("domain exceptions", () => {
  it("ValidationFailedException carries the field and message into a 400 body", () => {
    const exception = new ValidationFailedException("A quantidade deve ser maior que zero.", "quantity");

    expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(exception.getResponse()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "A quantidade deve ser maior que zero.", field: "quantity" },
    });
  });

  it("ProductNotFoundException is a 404 with a fixed message", () => {
    const exception = new ProductNotFoundException();

    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(exception.getResponse()).toEqual({
      error: { code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." },
    });
  });

  it("OutOfStockException is a 409 with a fixed message", () => {
    const exception = new OutOfStockException();

    expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(exception.getResponse()).toEqual({
      error: { code: "OUT_OF_STOCK", message: "Este produto está esgotado no momento." },
    });
  });

  it("OrderNotFoundException is a 404 with a fixed message", () => {
    const exception = new OrderNotFoundException();

    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(exception.getResponse()).toEqual({
      error: { code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." },
    });
  });
});
