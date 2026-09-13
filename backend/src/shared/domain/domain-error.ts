export abstract class DomainError extends Error {
  abstract readonly code: string;
  readonly field?: string;

  protected constructor(message: string, field?: string) {
    super(message);
    this.name = new.target.name;
    this.field = field;
  }
}
