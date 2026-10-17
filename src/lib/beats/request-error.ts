export type BeatRequestErrorCode = "INVALID" | "CONFLICT";

/**
 * Client-correctable beat request failure (bad input or wrong resource state).
 * Its message is written for the caller and safe to return; API mappers treat
 * every other non-AuthError as internal.
 */
export class BeatRequestError extends Error {
  readonly code: BeatRequestErrorCode;

  constructor(message: string, code: BeatRequestErrorCode = "INVALID") {
    super(message);
    this.name = "BeatRequestError";
    this.code = code;
  }
}
