import { DomainError } from "../../../shared/domain/domain-error";

export class ProductNotFoundError extends DomainError {
  readonly code = "PRODUCT_NOT_FOUND";

  constructor() {
    super("Produto não encontrado.");
  }
}
