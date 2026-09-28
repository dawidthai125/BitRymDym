/**
 * Wave 5 — pure grant input guards (no server-only; safe for unit tests).
 */

import { AuthError } from "@/lib/auth/session";

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
