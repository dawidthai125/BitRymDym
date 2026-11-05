import type { RecordingEligibilityDecision } from "@/lib/takes/recording-eligibility";

function extraCredits(credits: number): number {
  if (!Number.isSafeInteger(credits) || credits <= 0) return 0;
  return credits;
}

/**
 * Displayed master cap so `limit - used` is the plan remainder plus unused pack credits.
 * A credit-paid master is already inside `used`, so the limit grows with it.
 */
export function masterQuotaWithCredits(used: number, planLimit: number, credits: number): number {
  const safeUsed = Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0;
  const safePlan = Number.isFinite(planLimit) ? Math.max(0, Math.floor(planLimit)) : 0;
  return Math.max(safeUsed, safePlan) + extraCredits(credits);
}

/**
 * Take packs add sessions on top of today's plan allowance.
 * They do not lift the active-ready cap. Zero credits leaves the decision unchanged.
 */
export function withTakeCredits(
  decision: RecordingEligibilityDecision,
  credits: number,
): RecordingEligibilityDecision {
  const extra = extraCredits(credits);
  if (extra === 0) return decision;
  const limit = decision.dailySessionLimit + extra;
  if (decision.code !== "SESSION_DAY_CAP") {
    return { ...decision, dailySessionLimit: limit };
  }
  if (decision.dailySessionsUsed >= limit) {
    return { ...decision, dailySessionLimit: limit };
  }
  if (decision.activeReadyUsed >= decision.activeReadyCap) {
    return {
      ...decision,
      allowed: false,
      code: "ACTIVE_READY_CAP",
      dailySessionLimit: limit,
      message: `Masz pełny limit aktywnych nagrań (${decision.activeReadyUsed}/${decision.activeReadyCap}, plan ${decision.actor}). Usuń nagranie lub poczekaj na wygaśnięcie.`,
    };
  }
  return {
    ...decision,
    allowed: true,
    code: "ALLOWED",
    message: "OK",
    dailySessionLimit: limit,
    upgradeHintTier: null,
    upgradeHintMessage: null,
  };
}
