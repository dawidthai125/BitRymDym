/**
 * Recording Wave 5 — Shared Grants → RECORD (SSOT constants + ACTIVE predicate).
 * Design Freeze Addendum. No PLAYBACK/DOWNLOAD via grant.
 */

/** Max ACTIVE grants per beat (Architecture Review condition). */
export const MAX_ACTIVE_BEAT_ACCESS_GRANTS = 20;

/**
 * Canonical ACTIVE grant predicate (server + tests).
 * UI must not invent an alternate definition.
 */
export function isBeatAccessGrantActive(params: {
  revokedAt: string | null;
  expiresAt: string | null;
  nowMs?: number;
}): boolean {
  if (params.revokedAt != null) return false;
  if (params.expiresAt == null) return true;
  const now = params.nowMs ?? Date.now();
  return Date.parse(params.expiresAt) > now;
}

export type BeatRecordAccessSource = "PUBLIC_PUBLISHED" | "GRANT_RECORD";
