import { DomainError } from "../../../shared/domain/domain-error";

export class OrderNotFoundError extends DomainError {
  readonly code = "ORDER_NOT_FOUND";

  constructor() {
    super("Pedido não encontrado.");
  }
}
