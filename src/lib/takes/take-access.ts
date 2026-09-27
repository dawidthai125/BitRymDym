import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import { expectedUserTakeObjectKey } from "@/lib/takes/object-key";
import { isTakeExpired } from "@/lib/takes/entitlement";

export type TakeAccessRow = {
  id: string;
  owner_id: string | null;
  beat_id: string;
  status: string;
  object_key: string;
  storage_bucket: string;
  content_type: string | null;
  duration_seconds: number | null;
  byte_size: number | null;
  expires_at: string;
  deleted_at: string | null;
};

/**
 * Shared AuthZ gate for owner preview / download of a READY take.
 * Caller supplies already-loaded row (admin). Marks expiry as AuthError only —
 * lifecycle flip to EXPIRED is handled by janitor / explicit soft paths.
 */
export function assertOwnReadyTakeAccess(params: {
  take: TakeAccessRow;
  userId: string;
  purpose: "preview" | "download";
}): void {
  const { take, userId, purpose } = params;

  if (take.owner_id !== userId) {
    throw new AuthError("FORBIDDEN", "Not take owner.");
  }
  if (take.deleted_at || take.status === "DELETED") {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  if (take.status === "EXPIRED" || isTakeExpired({ expiresAt: take.expires_at })) {
    throw new AuthError("FORBIDDEN", "Take session expired.");
  }
  if (take.status !== "READY") {
    throw new AuthError(
      "FORBIDDEN",
      purpose === "download"
        ? "Take is not READY for download."
        : "Take is not READY for preview.",
    );
  }
  if (take.storage_bucket !== TAKE_AUDIO_BUCKET) {
    throw new AuthError("FORBIDDEN", "Invalid take storage bucket.");
  }
  if (
    !expectedUserTakeObjectKey({
      ownerId: userId,
      takeId: take.id,
      objectKey: take.object_key,
    })
  ) {
    throw new AuthError("FORBIDDEN", "Object key does not match take binding.");
  }
}
