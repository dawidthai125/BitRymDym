/**
 * PREMIUM-03 — Pure retention cleanup planner (R1).
 * Exact Storage delete scope beyond premium_works + known artifact links
 * remains OPEN in SSOT — this module only marks EXPIRED and plans known keys.
 */

export type PremiumCleanupWork = {
  id: string;
  ownerId: string;
  domain: "TAKE" | "STUDIO_PROJECT";
  domainRef: string;
  status: "WORK_READY" | "EXPIRED" | "DELETED" | "DRAFT";
  retentionExpiresAtMs: number | null;
};

export type PremiumCleanupPlan = {
  workId: string;
  markExpired: boolean;
  alreadyExpired: boolean;
  skipReason: string | null;
};

/** Idempotent: WORK_READY past expiry → EXPIRED; already EXPIRED is no-op success. */
export function planPremiumWorkExpiry(params: {
  work: PremiumCleanupWork;
  nowMs: number;
}): PremiumCleanupPlan {
  const { work, nowMs } = params;
  if (work.status === "EXPIRED" || work.status === "DELETED") {
    return {
      workId: work.id,
      markExpired: false,
      alreadyExpired: true,
      skipReason: null,
    };
  }
  if (work.status !== "WORK_READY") {
    return {
      workId: work.id,
      markExpired: false,
      alreadyExpired: false,
      skipReason: "NOT_READY",
    };
  }
  if (
    work.retentionExpiresAtMs == null ||
    work.retentionExpiresAtMs > nowMs
  ) {
    return {
      workId: work.id,
      markExpired: false,
      alreadyExpired: false,
      skipReason: "NOT_DUE",
    };
  }
  return {
    workId: work.id,
    markExpired: true,
    alreadyExpired: false,
    skipReason: null,
  };
}

/**
 * Apply plans to an in-memory store (unit tests).
 * Does not invent Storage deletes outside approved known refs.
 */
export function applyPremiumWorkExpiryPlans(params: {
  works: Map<string, PremiumCleanupWork>;
  plans: PremiumCleanupPlan[];
}): { expired: number; skipped: number } {
  let expired = 0;
  let skipped = 0;
  for (const plan of params.plans) {
    if (!plan.markExpired) {
      skipped += 1;
      continue;
    }
    const work = params.works.get(plan.workId);
    if (!work) {
      skipped += 1;
      continue;
    }
    if (work.status === "EXPIRED") {
      skipped += 1;
      continue;
    }
    work.status = "EXPIRED";
    expired += 1;
  }
  return { expired, skipped };
}
