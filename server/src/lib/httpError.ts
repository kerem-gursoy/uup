/**
 * A rejected request rather than a server fault, carrying the status the
 * controller should answer with.
 *
 * The status travels with the error because the alternative - matching on
 * message text - silently misclassified anything whose wording drifted, and a
 * user whose request was merely invalid got a blank 500.
 */
export class HttpError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}
