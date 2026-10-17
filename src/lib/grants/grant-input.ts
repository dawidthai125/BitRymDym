/**
 * Wave 5 — pure grant input guards (no server-only; safe for unit tests).
 */

import { AuthError } from "@/lib/auth/session";
import { BeatRequestError } from "@/lib/beats/request-error";

/** Reject client privilege / capability injection. */
export function rejectGrantClientPrivilegeFields(
  body: Record<string, unknown>,
) {
  const forbidden = [
    "can_record",
    "canRecord",
    "granted_by",
    "grantedBy",
    "owner_id",
    "ownerId",
    "capabilities",
    "can_playback",
    "canPlayback",
    "can_download",
    "canDownload",
  ] as const;
  for (const key of forbidden) {
    if (key in body && body[key] !== undefined) {
      throw new AuthError(
        "FORBIDDEN",
        "Client must not supply grant privilege fields.",
      );
    }
  }
}

/**
 * Optional grant expiry: absent / null / "" → no expiry; otherwise a parsable
 * timestamp strictly in the future (the RPC re-checks against DB `now()`).
 * Invalid input is a request error (400), not a permission denial.
 */
export function parseGrantExpiresAt(
  value: unknown,
  now: number = Date.now(),
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new BeatRequestError("expiresAt must be an ISO string or null.");
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms) || ms <= now) {
    throw new BeatRequestError("expiresAt must be a future ISO timestamp.");
  }
  return new Date(ms).toISOString();
}
