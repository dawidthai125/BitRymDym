/**
 * GO-PREMIUM-65 / H2-1 — Pure in-process semantic model of lease RPCs.
 *
 * Used by unit tests to exercise intended CAS rules without a live database.
 * This does NOT prove PostgreSQL row-lock atomicity under concurrency.
 */

import { PREMIUM_RETENTION_LEASE_LOCK_KEY } from "@/lib/premium/premium-retention-lease";

export type LeaseSemanticsState = {
  lockKey: string;
  fencingToken: number;
  holderRunId: string | null;
  leaseExpiresAtMs: number | null;
  acquiredAtMs: number | null;
  heartbeatAtMs: number | null;
};

export type LeaseSemanticsAcquireRow = {
  acquired: boolean;
  reason: "ACQUIRED" | "ALREADY_HELD" | "HELD";
  fencing_token: number | null;
  lease_expires_at: string | null;
  holder_run_id: string | null;
};

export type LeaseSemanticsRenewRow = {
  renewed: boolean;
  reason: "RENEWED" | "LEASE_LOST";
  fencing_token: number | null;
  lease_expires_at: string | null;
  holder_run_id: string | null;
};

export type LeaseSemanticsReleaseRow = {
  released: boolean;
  reason: "RELEASED" | "NOT_HOLDER";
  fencing_token: number | null;
};

export type LeaseSemanticsGetRow = {
  lock_key: string;
  fencing_token: number;
  holder_run_id: string | null;
  lease_expires_at: string | null;
  acquired_at: string | null;
  heartbeat_at: string | null;
  is_expired: boolean;
};

function iso(ms: number | null): string | null {
  return ms == null ? null : new Date(ms).toISOString();
}

export function createInitialLeaseSemanticsState(): LeaseSemanticsState {
  return {
    lockKey: PREMIUM_RETENTION_LEASE_LOCK_KEY,
    fencingToken: 0,
    holderRunId: null,
    leaseExpiresAtMs: null,
    acquiredAtMs: null,
    heartbeatAtMs: null,
  };
}

export function createPremiumRetentionLeaseSemantics(options?: {
  nowMs?: () => number;
  /** When true, mutate operations throw permission error (contract probe). */
  denyAll?: boolean;
}) {
  let state = createInitialLeaseSemanticsState();
  const nowMs = options?.nowMs ?? (() => Date.now());
  const denyAll = options?.denyAll ?? false;

  function assertServiceRole(): void {
    if (denyAll) {
      throw new Error("Only service_role may call premium_retention_lease_*");
    }
  }

  function acquire(p_run_id: string, p_ttl_seconds: number): LeaseSemanticsAcquireRow {
    assertServiceRole();
    if (!p_run_id) throw new Error("run_id required");
    if (!Number.isInteger(p_ttl_seconds) || p_ttl_seconds <= 0) {
      throw new Error("ttl_seconds must be positive");
    }
    const now = nowMs();
    const heldUnexpired =
      state.holderRunId != null &&
      state.leaseExpiresAtMs != null &&
      state.leaseExpiresAtMs > now;

    if (heldUnexpired && state.holderRunId === p_run_id) {
      return {
        acquired: true,
        reason: "ALREADY_HELD",
        fencing_token: state.fencingToken,
        lease_expires_at: iso(state.leaseExpiresAtMs),
        holder_run_id: state.holderRunId,
      };
    }

    const freeOrExpired =
      state.holderRunId == null ||
      state.leaseExpiresAtMs == null ||
      state.leaseExpiresAtMs <= now;

    if (!freeOrExpired) {
      return {
        acquired: false,
        reason: "HELD",
        fencing_token: null,
        lease_expires_at: iso(state.leaseExpiresAtMs),
        holder_run_id: state.holderRunId,
      };
    }

    state = {
      ...state,
      fencingToken: state.fencingToken + 1,
      holderRunId: p_run_id,
      acquiredAtMs: now,
      heartbeatAtMs: now,
      leaseExpiresAtMs: now + p_ttl_seconds * 1000,
    };

    return {
      acquired: true,
      reason: "ACQUIRED",
      fencing_token: state.fencingToken,
      lease_expires_at: iso(state.leaseExpiresAtMs),
      holder_run_id: state.holderRunId,
    };
  }

  function renew(
    p_run_id: string,
    p_fencing_token: number,
    p_ttl_seconds: number,
  ): LeaseSemanticsRenewRow {
    assertServiceRole();
    if (!p_run_id) throw new Error("run_id required");
    if (!Number.isInteger(p_fencing_token) || p_fencing_token < 0) {
      throw new Error("fencing_token required");
    }
    if (!Number.isInteger(p_ttl_seconds) || p_ttl_seconds <= 0) {
      throw new Error("ttl_seconds must be positive");
    }
    const now = nowMs();
    const ok =
      state.holderRunId === p_run_id &&
      state.fencingToken === p_fencing_token &&
      state.leaseExpiresAtMs != null &&
      state.leaseExpiresAtMs > now;

    if (!ok) {
      return {
        renewed: false,
        reason: "LEASE_LOST",
        fencing_token: null,
        lease_expires_at: null,
        holder_run_id: null,
      };
    }

    state = {
      ...state,
      heartbeatAtMs: now,
      leaseExpiresAtMs: now + p_ttl_seconds * 1000,
    };

    return {
      renewed: true,
      reason: "RENEWED",
      fencing_token: state.fencingToken,
      lease_expires_at: iso(state.leaseExpiresAtMs),
      holder_run_id: state.holderRunId,
    };
  }

  function release(
    p_run_id: string,
    p_fencing_token: number,
  ): LeaseSemanticsReleaseRow {
    assertServiceRole();
    if (!p_run_id) throw new Error("run_id required");
    if (!Number.isInteger(p_fencing_token) || p_fencing_token < 0) {
      throw new Error("fencing_token required");
    }

    const ok =
      state.holderRunId === p_run_id && state.fencingToken === p_fencing_token;

    if (!ok) {
      return {
        released: false,
        reason: "NOT_HOLDER",
        fencing_token: null,
      };
    }

    const token = state.fencingToken;
    state = {
      ...state,
      holderRunId: null,
      leaseExpiresAtMs: null,
      acquiredAtMs: null,
      heartbeatAtMs: null,
    };

    return {
      released: true,
      reason: "RELEASED",
      fencing_token: token,
    };
  }

  function get(): LeaseSemanticsGetRow {
    assertServiceRole();
    const now = nowMs();
    const isExpired =
      state.holderRunId != null &&
      (state.leaseExpiresAtMs == null || state.leaseExpiresAtMs <= now);
    return {
      lock_key: state.lockKey,
      fencing_token: state.fencingToken,
      holder_run_id: state.holderRunId,
      lease_expires_at: iso(state.leaseExpiresAtMs),
      acquired_at: iso(state.acquiredAtMs),
      heartbeat_at: iso(state.heartbeatAtMs),
      is_expired: isExpired,
    };
  }

  /** Serialized "concurrent" acquire helper for unit illustration — not PG proof. */
  function tryConcurrentAcquire(
    a: { runId: string; ttlSeconds: number },
    b: { runId: string; ttlSeconds: number },
  ): { first: LeaseSemanticsAcquireRow; second: LeaseSemanticsAcquireRow } {
    const first = acquire(a.runId, a.ttlSeconds);
    const second = acquire(b.runId, b.ttlSeconds);
    return { first, second };
  }

  return {
    acquire,
    renew,
    release,
    get,
    tryConcurrentAcquire,
    snapshot: () => ({ ...state }),
    /** Advance fake clock by mutating external nowMs closure — tests own the clock. */
  };
}

export type PremiumRetentionLeaseSemantics = ReturnType<
  typeof createPremiumRetentionLeaseSemantics
>;
