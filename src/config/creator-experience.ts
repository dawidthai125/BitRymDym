/**
 * Creator Progress W1 — experience amounts, caps, rank thresholds (SSOT config).
 * Design Freeze: docs/decisions/CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md
 * Not Account Level. Not Premium.
 */

import type {
  CreatorExperienceEventType,
  CreatorRank,
} from "@/types/creator-progress";

/** Rank thresholds: experience_total >= threshold → rank (highest match). */
export const CREATOR_RANK_THRESHOLDS: readonly {
  rank: CreatorRank;
  minExperience: number;
}[] = [
  { rank: "LEGEND_RAPPER", minExperience: 20_000 },
  { rank: "ELITE_RAPPER", minExperience: 7_000 },
  { rank: "PRO_RAPPER", minExperience: 2_500 },
  { rank: "RISING_RAPPER", minExperience: 800 },
  { rank: "ROOKIE_RAPPER", minExperience: 200 },
  { rank: "BEGINNER_RAPPER", minExperience: 0 },
] as const;

export const CREATOR_EXPERIENCE_AMOUNTS = {
  PROFILE_COMPLETED: 25,
  BEAT_APPROVED: 40,
  BEAT_FIRST_PUBLISHED: 120,
  MIX_SESSION_FIRST_EXPORT: 35,
  RENDER_SUCCEEDED: 15,
  TAKE_READY: 10,
} as const satisfies Record<
  Exclude<CreatorExperienceEventType, "ADMIN_CORRECTION">,
  number
>;

/** null = no daily cap (subject/idempotency only). */
export const CREATOR_EXPERIENCE_DAILY_CAPS: Partial<
  Record<CreatorExperienceEventType, number>
> = {
  RENDER_SUCCEEDED: 2,
  TAKE_READY: 3,
};

export function idempotencyKeyFor(
  eventType: CreatorExperienceEventType,
  subjectId: string,
): string {
  switch (eventType) {
    case "PROFILE_COMPLETED":
      return `profile_completed:${subjectId}`;
    case "BEAT_APPROVED":
      return `beat_approved:${subjectId}`;
    case "BEAT_FIRST_PUBLISHED":
      return `beat_first_published:${subjectId}`;
    case "MIX_SESSION_FIRST_EXPORT":
      return `mix_first_export:${subjectId}`;
    case "RENDER_SUCCEEDED":
      return `render_succeeded:${subjectId}`;
    case "TAKE_READY":
      return `take_ready:${subjectId}`;
    case "ADMIN_CORRECTION":
      return `admin_correction:${subjectId}`;
    default: {
      const _exhaustive: never = eventType;
      return _exhaustive;
    }
  }
}
