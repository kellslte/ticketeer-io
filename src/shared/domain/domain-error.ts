/**
 * Base class for business-rule violations. Carries a stable machine-readable
 * `code` and no HTTP knowledge; AllExceptionsFilter maps `code` to a status.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
