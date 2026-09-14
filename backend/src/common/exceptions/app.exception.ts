import { HttpException, HttpStatus } from "@nestjs/common";

export class ValidationFailedException extends HttpException {
  constructor(message: string, field: string) {
    super({ error: { code: "VALIDATION_ERROR", message, field } }, HttpStatus.BAD_REQUEST);
  }
}

export class ProductNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: "PRODUCT_NOT_FOUND", message: "Produto não encontrado." } }, HttpStatus.NOT_FOUND);
  }
}

export class OutOfStockException extends HttpException {
  constructor() {
    super(
      { error: { code: "OUT_OF_STOCK", message: "Este produto está esgotado no momento." } },
      HttpStatus.CONFLICT,
    );
  }
}

export class OrderNotFoundException extends HttpException {
  constructor() {
    super({ error: { code: "ORDER_NOT_FOUND", message: "Pedido não encontrado." } }, HttpStatus.NOT_FOUND);
  }
}
