import { DomainError } from "../../../shared/domain/domain-error";

export class OutOfStockError extends DomainError {
  readonly code = "OUT_OF_STOCK";

  constructor() {
    super("Este produto está esgotado no momento.");
  }
}
