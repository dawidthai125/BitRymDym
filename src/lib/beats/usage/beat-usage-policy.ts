/**
 * User beats 2026-10-30 — canonical owner-controlled usage policy (pure).
 *
 * One place answers "may this viewer see / download / use this beat in
 * Studio (incl. recording takes)?" for USER beats. PLATFORM beats are always
 * public; their original-download deny stays in audio-validation.
 *
 * Rules (Owner decisions):
 * - visibility "private" → only owner, active grantees and staff.
 * - allow_download (default ON) → non-owners may download (plan limits apply).
 * - allow_studio_use (default ON) → non-owners may attach / record.
 * - An active grant (beat_access_grants.can_record) overrides private and
 *   allow_studio_use=false for that grantee (explicit per-user permission).
 *   It does not override allow_download=false.
 */

import type {
  BeatOwnershipType,
  BeatStatus,
  BeatVisibility,
} from "@/types/domain";

export type BeatUsageSubject = {
  status: BeatStatus | string;
  ownershipType: BeatOwnershipType | string;
  ownerId: string | null;
  visibility?: BeatVisibility | string | null;
  allowDownload?: boolean | null;
  allowStudioUse?: boolean | null;
};

export type BeatUsageViewer = {
  userId: string | null;
  isStaff?: boolean;
  hasActiveGrant?: boolean;
};

export type BeatUsageDenyReason =
  | "NOT_PUBLISHED"
  | "PRIVATE"
  | "DOWNLOAD_DISABLED"
  | "STUDIO_USE_DISABLED";

export type BeatUsageDecision =
  | { allowed: true }
  | { allowed: false; reason: BeatUsageDenyReason };

const ALLOW: BeatUsageDecision = { allowed: true };

export function normalizeBeatVisibility(
  value: BeatUsageSubject["visibility"],
): BeatVisibility {
  return value === "private" ? "private" : "public";
}

export function isBeatOwner(
  beat: Pick<BeatUsageSubject, "ownershipType" | "ownerId">,
  userId: string | null,
): boolean {
  return (
    beat.ownershipType === "USER" &&
    Boolean(userId) &&
    beat.ownerId === userId
  );
}

/** Public catalogue listing: PUBLISHED + public visibility. */
export function isBeatInPublicCatalogue(beat: BeatUsageSubject): boolean {
  return (
    beat.status === "PUBLISHED" &&
    (beat.ownershipType !== "USER" ||
      normalizeBeatVisibility(beat.visibility) === "public")
  );
}

/** Detail / playback visibility for a viewer. */
export function canViewBeat(
  beat: BeatUsageSubject,
  viewer: BeatUsageViewer,
): BeatUsageDecision {
  if (isBeatOwner(beat, viewer.userId) || viewer.isStaff) return ALLOW;
  if (beat.status !== "PUBLISHED") return { allowed: false, reason: "NOT_PUBLISHED" };
  if (isBeatInPublicCatalogue(beat)) return ALLOW;
  if (viewer.userId && viewer.hasActiveGrant) return ALLOW;
  return { allowed: false, reason: "PRIVATE" };
}

/** Studio attach + take recording by a signed-in user. */
export function canUseBeatInStudio(
  beat: BeatUsageSubject,
  viewer: BeatUsageViewer,
): BeatUsageDecision {
  if (isBeatOwner(beat, viewer.userId)) return ALLOW;
  if (beat.status !== "PUBLISHED") return { allowed: false, reason: "NOT_PUBLISHED" };
  if (beat.ownershipType !== "USER") return ALLOW;
  if (viewer.userId && viewer.hasActiveGrant) return ALLOW;
  if (normalizeBeatVisibility(beat.visibility) === "private") {
    return { allowed: false, reason: "PRIVATE" };
  }
  if (beat.allowStudioUse === false) {
    return { allowed: false, reason: "STUDIO_USE_DISABLED" };
  }
  return ALLOW;
}

/** Anonymous recording: public USER beats with Studio use ON, or PLATFORM. */
export function canAnonUseBeat(beat: BeatUsageSubject): BeatUsageDecision {
  return canUseBeatInStudio(beat, { userId: null });
}

/**
 * USER-beat master download by owner choice. Plan / daily limits and the
 * PLATFORM deny are enforced separately by the audio access gate.
 */
export function canDownloadBeatByOwnerChoice(
  beat: BeatUsageSubject,
  viewer: BeatUsageViewer,
): BeatUsageDecision {
  if (isBeatOwner(beat, viewer.userId) || viewer.isStaff) return ALLOW;
  if (beat.ownershipType !== "USER") return ALLOW;
  const view = canViewBeat(beat, viewer);
  if (!view.allowed) return view;
  if (beat.allowDownload === false) {
    return { allowed: false, reason: "DOWNLOAD_DISABLED" };
  }
  return ALLOW;
}
