/**
 * Creator Rank pure derivation from experience_total.
 * Never writes profiles.account_level.
 */

import { CREATOR_RANK_THRESHOLDS } from "@/config/creator-experience";
import type { CreatorRank } from "@/types/creator-progress";
import type { AccountLevel } from "@/types/domain";

export function deriveCreatorRank(experienceTotal: number): CreatorRank {
  const total = Number.isFinite(experienceTotal)
    ? Math.floor(experienceTotal)
    : 0;
  const clamped = Math.max(0, total);
  for (const row of CREATOR_RANK_THRESHOLDS) {
    if (clamped >= row.minExperience) return row.rank;
  }
  return "BEGINNER_RAPPER";
}

/**
 * Inclusive experience window for a rank, derived from the same threshold table
 * as `deriveCreatorRank` — not a second ladder.
 */
export function experienceBoundsForRank(rank: CreatorRank): {
  minInclusive: number;
  maxExclusive: number | null;
} {
  const ascending = [...CREATOR_RANK_THRESHOLDS].sort(
    (a, b) => a.minExperience - b.minExperience,
  );
  const index = ascending.findIndex((row) => row.rank === rank);
  if (index < 0) {
    return { minInclusive: 0, maxExclusive: 0 };
  }
  const minInclusive = ascending[index].minExperience;
  const next = ascending[index + 1];
  return {
    minInclusive,
    maxExclusive: next ? next.minExperience : null,
  };
}

/** Next threshold above current total, or null at Legend. */
export function nextCreatorRankThreshold(
  experienceTotal: number,
): { rank: CreatorRank; threshold: number } | null {
  const ascending = [...CREATOR_RANK_THRESHOLDS].reverse();
  for (const row of ascending) {
    if (experienceTotal < row.minExperience) {
      return { rank: row.rank, threshold: row.minExperience };
    }
  }
  return null;
}

/**
 * Semantic guard: Rank and AccountLevel may share string literals but are
 * different product axes. Do not treat equality as identity.
 */
export function assertCreatorRankNotAccountLevelAxis(
  rank: CreatorRank,
  accountLevel: AccountLevel,
): {
  sameStringPossible: boolean;
  axesDistinct: true;
} {
  void rank;
  void accountLevel;
  return { sameStringPossible: true, axesDistinct: true };
}
