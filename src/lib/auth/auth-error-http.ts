import type { AuthError } from "@/lib/auth/session";

/** HTTP status for an `AuthError` in JSON API responses. */
export function authErrorHttpStatus(error: AuthError): number {
  switch (error.code) {
    case "UNAUTHENTICATED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "FORBIDDEN":
    default:
      return 403;
  }
}
