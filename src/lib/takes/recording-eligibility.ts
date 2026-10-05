/**
 * P4.1 — pure recording eligibility gate (no I/O).
 * Server counts + getSamplePolicy feed this; client never supplies caps.
 */

import type { SamplePolicy } from "@/lib/takes/entitlement";
import type { PremiumTier } from "@/types/premium";

export const RECORDING_ELIGIBILITY_CODES = [
  "ALLOWED",
  "BEAT_NOT_PUBLISHED",
  "SESSION_DAY_CAP",
  "ACTIVE_READY_CAP",
  "INVALID_BEAT",
] as const;

export type RecordingEligibilityCode =
  (typeof RECORDING_ELIGIBILITY_CODES)[number];

export type RecordingEligibilityDecision = {
  allowed: boolean;
  code: RecordingEligibilityCode;
  message: string;
  maxRecordingSeconds: number;
  actor: SamplePolicy["actor"];
  premiumTier: PremiumTier | null;
  dailySessionsUsed: number;
  dailySessionLimit: number;
  activeReadyUsed: number;
  activeReadyCap: number;
  /** Soft upsell hint when caps block (not a second entitlement system). */
  upgradeHintTier: PremiumTier | null;
  upgradeHintMessage: string | null;
};

const NEXT_TIER: Record<Exclude<SamplePolicy["actor"], "ANONYMOUS">, PremiumTier | null> =
  {
    FREE: "BRONZE",
    BRONZE: "SILVER",
    SILVER: "GOLD",
    GOLD: null,
  };

function polishCapMessage(params: {
  code: "SESSION_DAY_CAP" | "ACTIVE_READY_CAP";
  actor: SamplePolicy["actor"];
  used: number;
  limit: number;
}): { message: string; upgradeHintTier: PremiumTier | null; upgradeHintMessage: string | null } {
  const planLabel =
    params.actor === "ANONYMOUS" ? "gościnny" : params.actor;
  if (params.code === "SESSION_DAY_CAP") {
    const message = `Wykorzystano dzienny limit nagrań (${params.used}/${params.limit}, plan ${planLabel}).`;
    if (params.actor === "ANONYMOUS") {
      return {
        message: `${message} Zaloguj się, aby nagrywać dłużej i częściej.`,
        upgradeHintTier: null,
        upgradeHintMessage: "Zaloguj się, aby dostać wyższy limit.",
      };
    }
    if (params.actor === "GOLD") {
      return { message, upgradeHintTier: null, upgradeHintMessage: null };
    }
    const next = NEXT_TIER[params.actor];
    return {
      message,
      upgradeHintTier: next,
      upgradeHintMessage: next
        ? `Dostępne w planie ${next}.`
        : null,
    };
  }
  const message = `Masz pełny limit aktywnych nagrań (${params.used}/${params.limit}, plan ${planLabel}). Usuń nagranie lub poczekaj na wygaśnięcie.`;
  if (params.actor === "ANONYMOUS") {
    return {
      message: `${message} Po zalogowaniu limit jest wyższy.`,
      upgradeHintTier: null,
      upgradeHintMessage: "Zaloguj się, aby przechowywać więcej nagrań.",
    };
  }
  if (params.actor === "GOLD") {
    return { message, upgradeHintTier: null, upgradeHintMessage: null };
  }
  const next = NEXT_TIER[params.actor];
  return {
    message,
    upgradeHintTier: next,
    upgradeHintMessage: next ? `Więcej slotów w planie ${next}.` : null,
  };
}

/**
 * Decide whether a new recording session may start (before getUserMedia).
 * ACTIVE_READY_CAP and SESSION_DAY_CAP are hard DENY for mic arm
 * (replace-on-upload remains available if user somehow recorded earlier).
 */
export function decideRecordingEligibility(params: {
  beatStatus: string;
  policy: SamplePolicy;
  premiumTier: PremiumTier | null;
  sessionsToday: number;
  activeReadyCount: number;
}): RecordingEligibilityDecision {
  const {
    beatStatus,
    policy,
    premiumTier,
    sessionsToday,
    activeReadyCount,
  } = params;

  const base = {
    maxRecordingSeconds: policy.maxRecordingSeconds,
    actor: policy.actor,
    premiumTier,
    dailySessionsUsed: sessionsToday,
    dailySessionLimit: policy.dailySessionLimit,
    activeReadyUsed: activeReadyCount,
    activeReadyCap: policy.activeReadyCap,
  };

  if (beatStatus !== "PUBLISHED") {
    return {
      ...base,
      allowed: false,
      code: "BEAT_NOT_PUBLISHED",
      message: "Nagrywanie jest dostępne tylko dla opublikowanych bitów.",
      upgradeHintTier: null,
      upgradeHintMessage: null,
    };
  }

  if (sessionsToday >= policy.dailySessionLimit) {
    const soft = polishCapMessage({
      code: "SESSION_DAY_CAP",
      actor: policy.actor,
      used: sessionsToday,
      limit: policy.dailySessionLimit,
    });
    return {
      ...base,
      allowed: false,
      code: "SESSION_DAY_CAP",
      message: soft.message,
      upgradeHintTier: soft.upgradeHintTier,
      upgradeHintMessage: soft.upgradeHintMessage,
    };
  }

  if (activeReadyCount >= policy.activeReadyCap) {
    const soft = polishCapMessage({
      code: "ACTIVE_READY_CAP",
      actor: policy.actor,
      used: activeReadyCount,
      limit: policy.activeReadyCap,
    });
    return {
      ...base,
      allowed: false,
      code: "ACTIVE_READY_CAP",
      message: soft.message,
      upgradeHintTier: soft.upgradeHintTier,
      upgradeHintMessage: soft.upgradeHintMessage,
    };
  }

  return {
    ...base,
    allowed: true,
    code: "ALLOWED",
    message: "OK",
    upgradeHintTier: null,
    upgradeHintMessage: null,
  };
}
