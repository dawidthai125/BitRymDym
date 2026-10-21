/**
 * PREMIUM-02 — Pure transactional unlock semantics (unit-testable without DB).
 * Mirrors RPC premium_unlock_work intent: atomic consume + sticky unlock + KEY_REUSE.
 */

import {
  creditPeriodBounds,
  retentionMsForTier,
  unlockCreditsForTier,
} from "@/config/premium-export-policy";
import type { PremiumTier } from "@/types/premium";

export type PureWork = {
  id: string;
  ownerId: string;
  status: "DRAFT" | "WORK_READY" | "EXPIRED" | "DELETED";
  retentionExpiresAtMs: number | null;
  unlockCount: number;
};

export type PureUnlock = {
  id: string;
  userId: string;
  workId: string;
  idempotencyKey: string;
  retentionExpiresAtMs: number;
};

export type PureCreditPeriod = {
  userId: string;
  periodIndex: number;
  activatedAtMs: number;
  granted: number;
  consumed: number;
};

export type PureUnlockStore = {
  works: Map<string, PureWork>;
  unlocks: PureUnlock[];
  periods: PureCreditPeriod[];
  events: Array<{ type: string; detail: Record<string, unknown> }>;
};

export type UnlockResult =
  | {
      ok: true;
      unlockId: string;
      reused: boolean;
      retentionExpiresAtMs: number;
      creditsRemaining: number | null;
    }
  | {
      ok: false;
      reason:
        | "WORK_NOT_FOUND"
        | "NOT_OWNER"
        | "EXPIRED_OR_NOT_READY"
        | "KEY_REUSE"
        | "NO_CREDITS"
        | "ALREADY_UNLOCKED";
    };

let unlockSeq = 0;

export function createEmptyUnlockStore(): PureUnlockStore {
  return {
    works: new Map(),
    unlocks: [],
    periods: [],
    events: [],
  };
}

/**
 * Single-threaded atomic unlock. Callers must serialize (mutex) for concurrency tests.
 */
export function pureUnlockWork(params: {
  store: PureUnlockStore;
  userId: string;
  workId: string;
  idempotencyKey: string;
  premiumTier: PremiumTier;
  activatedAtMs: number;
  nowMs: number;
}): UnlockResult {
  const key = params.idempotencyKey.trim();
  if (!key) {
    return { ok: false, reason: "KEY_REUSE" };
  }

  const work = params.store.works.get(params.workId);
  if (!work) return { ok: false, reason: "WORK_NOT_FOUND" };
  if (work.ownerId !== params.userId) return { ok: false, reason: "NOT_OWNER" };
  if (
    work.status !== "WORK_READY" ||
    work.retentionExpiresAtMs == null ||
    work.retentionExpiresAtMs <= params.nowMs
  ) {
    return { ok: false, reason: "EXPIRED_OR_NOT_READY" };
  }

  const byKey = params.store.unlocks.find(
    (u) => u.userId === params.userId && u.idempotencyKey === key,
  );
  if (byKey) {
    if (byKey.workId !== params.workId) {
      return { ok: false, reason: "KEY_REUSE" };
    }
    return {
      ok: true,
      unlockId: byKey.id,
      reused: true,
      retentionExpiresAtMs: byKey.retentionExpiresAtMs,
      creditsRemaining: null,
    };
  }

  const sticky = params.store.unlocks.find(
    (u) => u.userId === params.userId && u.workId === params.workId,
  );
  if (sticky) {
    return {
      ok: true,
      unlockId: sticky.id,
      reused: true,
      retentionExpiresAtMs: sticky.retentionExpiresAtMs,
      creditsRemaining: null,
    };
  }

  if (work.unlockCount >= 1) {
    return { ok: false, reason: "ALREADY_UNLOCKED" };
  }

  const granted = unlockCreditsForTier(params.premiumTier);
  if (granted <= 0) return { ok: false, reason: "NO_CREDITS" };

  const bounds = creditPeriodBounds({
    activatedAtMs: params.activatedAtMs,
    nowMs: params.nowMs,
  });

  let period = params.store.periods.find(
    (p) =>
      p.userId === params.userId &&
      p.periodIndex === bounds.periodIndex &&
      p.activatedAtMs === params.activatedAtMs,
  );
  if (!period) {
    period = {
      userId: params.userId,
      periodIndex: bounds.periodIndex,
      activatedAtMs: params.activatedAtMs,
      granted,
      consumed: 0,
    };
    params.store.periods.push(period);
  }

  if (period.consumed >= period.granted) {
    return { ok: false, reason: "NO_CREDITS" };
  }

  period.consumed += 1;
  const retentionExpiresAtMs = params.nowMs + retentionMsForTier(params.premiumTier);
  const unlockId = `ul_${++unlockSeq}`;
  params.store.unlocks.push({
    id: unlockId,
    userId: params.userId,
    workId: params.workId,
    idempotencyKey: key,
    retentionExpiresAtMs,
  });
  work.unlockCount = 1;
  work.retentionExpiresAtMs = retentionExpiresAtMs;
  params.store.events.push({
    type: "UNLOCK_OK",
    detail: { unlockId, workId: params.workId },
  });

  return {
    ok: true,
    unlockId,
    reused: false,
    retentionExpiresAtMs,
    creditsRemaining: period.granted - period.consumed,
  };
}

/** Mark WORK_READY once — tip edits must not restart (D-2). */
export function pureMarkWorkReady(params: {
  store: PureUnlockStore;
  userId: string;
  workId: string;
  premiumTier: PremiumTier;
  nowMs: number;
}): { created: boolean; retentionExpiresAtMs: number } {
  const existing = params.store.works.get(params.workId);
  if (existing) {
    return {
      created: false,
      retentionExpiresAtMs: existing.retentionExpiresAtMs ?? params.nowMs,
    };
  }
  const retentionExpiresAtMs =
    params.nowMs + retentionMsForTier(params.premiumTier);
  params.store.works.set(params.workId, {
    id: params.workId,
    ownerId: params.userId,
    status: "WORK_READY",
    retentionExpiresAtMs,
    unlockCount: 0,
  });
  params.store.events.push({
    type: "MARK_WORK_READY",
    detail: { workId: params.workId },
  });
  return { created: true, retentionExpiresAtMs };
}
