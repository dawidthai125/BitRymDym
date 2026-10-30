import "server-only";

import { AuthError } from "@/lib/auth/session";
import {
  canUseBeatInStudio,
  isBeatOwner,
  normalizeBeatVisibility,
  type BeatUsageSubject,
} from "@/lib/beats/usage/beat-usage-policy";
import { hasActiveRecordGrant } from "@/lib/grants/beat-access-grants";

/** Columns every server-side usage check needs (append to an existing select). */
export const BEAT_USAGE_COLUMNS =
  "status, ownership_type, owner_id, visibility, allow_studio_use, allow_download";

export function beatUsageSubjectFromRow(
  row: Record<string, unknown>,
): BeatUsageSubject {
  return {
    status: String(row.status ?? ""),
    ownershipType: String(row.ownership_type ?? ""),
    ownerId: (row.owner_id as string | null) ?? null,
    visibility: (row.visibility as string | null) ?? null,
    allowDownload: (row.allow_download as boolean | null) ?? null,
    allowStudioUse: (row.allow_studio_use as boolean | null) ?? null,
  };
}

/** Grant lookup only when it can change the outcome (USER, non-owner, restricted). */
async function grantMatters(
  beatId: string,
  beat: BeatUsageSubject,
  userId: string | null,
): Promise<boolean> {
  if (!userId || beat.ownershipType !== "USER" || isBeatOwner(beat, userId)) {
    return false;
  }
  if (beat.status !== "PUBLISHED") return false;
  const restricted =
    normalizeBeatVisibility(beat.visibility) === "private" ||
    beat.allowStudioUse === false;
  if (!restricted) return false;
  return hasActiveRecordGrant({ beatId, granteeUserId: userId });
}

/** Take recording denied by owner settings (mapped to user copy in lib-text). */
export const BEAT_RECORD_NOT_ALLOWED = "Recording is not allowed on this beat.";

export const BEAT_STUDIO_USE_DENIED_MESSAGE =
  "Ten bit nie jest dostępny do użycia w Studio.";

/**
 * Studio attach / project create / take recording AuthZ for a signed-in user
 * (owner, PUBLISHED public with Studio use ON, or an active grant).
 */
export async function assertBeatStudioUse(params: {
  beatId: string;
  row: Record<string, unknown>;
  userId: string | null;
  /** Message for the FORBIDDEN error (domain-specific copy). */
  message?: string;
}): Promise<void> {
  const beat = beatUsageSubjectFromRow(params.row);
  const hasActiveGrant = await grantMatters(params.beatId, beat, params.userId);
  const decision = canUseBeatInStudio(beat, {
    userId: params.userId,
    hasActiveGrant,
  });
  if (!decision.allowed) {
    throw new AuthError(
      "FORBIDDEN",
      params.message ?? BEAT_STUDIO_USE_DENIED_MESSAGE,
    );
  }
}
