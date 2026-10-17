import "server-only";

import { AuthError } from "@/lib/auth/session";

export type AccessDenial = "UNAUTHENTICATED" | "FORBIDDEN";

/**
 * Runs a viewer-access guard and returns its expected denial instead of
 * throwing it. Any other error propagates.
 *
 * Only pass guards whose FORBIDDEN means "this viewer lacks access"
 * (requireRole / requirePermission compositions). Data functions that also
 * throw FORBIDDEN for content reasons must not be wrapped.
 */
export async function checkAccess(
  guard: () => Promise<unknown>,
): Promise<AccessDenial | null> {
  try {
    await guard();
    return null;
  } catch (error) {
    if (
      error instanceof AuthError &&
      (error.code === "UNAUTHENTICATED" || error.code === "FORBIDDEN")
    ) {
      return error.code;
    }
    throw error;
  }
}
