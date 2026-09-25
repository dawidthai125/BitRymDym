/**
 * Domain enums from Master SSOT / OD-03.
 * Role ≠ Account Level — never conflate these.
 */

export const SYSTEM_ROLES = ["ADMIN", "MODERATOR", "USER"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Working names — OD-09 OPEN for final labels. */
export const ACCOUNT_LEVELS = [
  "BEGINNER_RAPPER",
  "PRO_RAPPER",
  "LEGEND_RAPPER",
] as const;
export type AccountLevel = (typeof ACCOUNT_LEVELS)[number];

export const BEAT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "PUBLISHED",
  "REJECTED",
  "ARCHIVED",
] as const;
export type BeatStatus = (typeof BEAT_STATUSES)[number];
