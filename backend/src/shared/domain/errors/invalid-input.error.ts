import { DomainError } from "../domain-error";

export class InvalidInputError extends DomainError {
  readonly code = "VALIDATION_ERROR";

  constructor(message: string, field: string) {
    super(message, field);
  }
}
