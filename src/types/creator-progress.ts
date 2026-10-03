/**
 * Creator Progress W1 — Rank / Experience domain types.
 * CreatorRank ≠ AccountLevel (recording) ≠ Role ≠ Premium.
 * Design Freeze: docs/decisions/CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md
 */

/** Creator Rank ladder (progress). Not profiles.account_level. */
export const CREATOR_RANKS = [
  "BEGINNER_RAPPER",
  "ROOKIE_RAPPER",
  "RISING_RAPPER",
  "PRO_RAPPER",
  "ELITE_RAPPER",
  "LEGEND_RAPPER",
] as const;

export type CreatorRank = (typeof CREATOR_RANKS)[number];

export const CREATOR_EXPERIENCE_EVENT_TYPES = [
  "PROFILE_COMPLETED",
  "BEAT_APPROVED",
  "BEAT_FIRST_PUBLISHED",
  "MIX_SESSION_FIRST_EXPORT",
  "RENDER_SUCCEEDED",
  "TAKE_READY",
  "ADMIN_CORRECTION",
] as const;

export type CreatorExperienceEventType =
  (typeof CREATOR_EXPERIENCE_EVENT_TYPES)[number];
