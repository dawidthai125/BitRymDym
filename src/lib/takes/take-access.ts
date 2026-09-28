import "server-only";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import { AuthError } from "@/lib/auth/session";
import { isTakeExpired } from "@/lib/takes/entitlement";
import {
  expectedAnonTakeObjectKey,
  expectedUserTakeObjectKey,
} from "@/lib/takes/object-key";
import { anonymousTakeTokenHashPrefix } from "@/lib/takes/token-hash";

export type TakeAccessRow = {
  id: string;
  owner_id: string | null;
  anonymous_token_hash?: string | null;
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

/**
 * D02 anonymous READY preview gate.
 * Hash match is mandatory — takeId alone is never authority.
 * purpose=download is intentionally unsupported for anonymous (no download module).
 */
export function assertOwnAnonReadyTakeAccess(params: {
  take: TakeAccessRow;
  tokenHash: string;
}): void {
  const { take, tokenHash } = params;

  if (!tokenHash || tokenHash.length < 32) {
    throw new AuthError("UNAUTHENTICATED", "Anonymous take identity required.");
  }
  if (!take.anonymous_token_hash || take.anonymous_token_hash !== tokenHash) {
    throw new AuthError("FORBIDDEN", "Not anonymous take owner.");
  }
  if (take.owner_id != null) {
    throw new AuthError("FORBIDDEN", "Take is not anonymous.");
  }
  if (take.deleted_at || take.status === "DELETED") {
    throw new AuthError("FORBIDDEN", "Take was deleted.");
  }
  if (take.status === "EXPIRED" || isTakeExpired({ expiresAt: take.expires_at })) {
    throw new AuthError("FORBIDDEN", "Take session expired.");
  }
  if (take.status !== "READY") {
    throw new AuthError("FORBIDDEN", "Take is not READY for preview.");
  }
  if (take.storage_bucket !== TAKE_AUDIO_BUCKET) {
    throw new AuthError("FORBIDDEN", "Invalid take storage bucket.");
  }
  if (
    !expectedAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(tokenHash),
      takeId: take.id,
      objectKey: take.object_key,
    })
  ) {
    throw new AuthError("FORBIDDEN", "Object key does not match take binding.");
  }
}
