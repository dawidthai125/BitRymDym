/**
 * Pure cover moderation decision (testable without network).
 */
import {
  BEAT_COVER_AUTO_REJECT_SCORE,
  BEAT_COVER_REVIEW_SCORE,
  BEAT_COVER_STRICT_CATEGORIES,
  BEAT_COVER_STRICT_REJECT_SCORE,
} from "@/config/beat-covers";

export type CoverModerationDecision = "approve" | "review" | "reject";

export type CoverModerationOutcome = {
  provider: "openai" | "none";
  decision: CoverModerationDecision;
  flagged: boolean;
  maxScore: number | null;
  topCategory: string | null;
  /** Category → score (rounded), stored in beats.cover_moderation. */
  scores: Record<string, number>;
  /** Why the filter could not run (no key / timeout / API error). */
  skippedReason?: "disabled" | "error";
};

export function decideCoverModeration(input: {
  flagged: boolean;
  scores: Record<string, number>;
}): Pick<CoverModerationOutcome, "decision" | "maxScore" | "topCategory"> {
  let maxScore = 0;
  let topCategory: string | null = null;
  let strictHit = false;
  for (const [category, raw] of Object.entries(input.scores)) {
    const score = Number.isFinite(raw) ? raw : 0;
    if (score > maxScore) {
      maxScore = score;
      topCategory = category;
    }
    if (
      (BEAT_COVER_STRICT_CATEGORIES as readonly string[]).includes(category) &&
      score >= BEAT_COVER_STRICT_REJECT_SCORE
    ) {
      strictHit = true;
    }
  }
  let decision: CoverModerationDecision = "approve";
  if (strictHit || maxScore >= BEAT_COVER_AUTO_REJECT_SCORE) {
    decision = "reject";
  } else if (input.flagged || maxScore >= BEAT_COVER_REVIEW_SCORE) {
    decision = "review";
  }
  return { decision, maxScore, topCategory };
}

/** Filter unavailable → moderator decides (never auto-approve). */
export function coverModerationSkipped(
  reason: "disabled" | "error",
): CoverModerationOutcome {
  return {
    provider: "none",
    decision: "review",
    flagged: false,
    maxScore: null,
    topCategory: null,
    scores: {},
    skippedReason: reason,
  };
}

/** Next beats.cover_status for an automatic decision ("reject" is never stored). */
export function coverStatusForDecision(
  decision: Exclude<CoverModerationDecision, "reject">,
): "approved" | "pending" {
  return decision === "approve" ? "approved" : "pending";
}
