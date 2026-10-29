/**
 * GO-PREMIUM-65 / H2-1 — Premium Retention lease RPC contract + worker client.
 *
 * Lease RPC contract. Scheduler L1 wiring is in premium-retention-scheduler.ts (H2-3).
 * Atomic acquire is the SECURITY DEFINER RPC (single SQL CAS) — never app SELECT+UPDATE.
 * Logical deletes (EXPIRED mark, artifact soft-delete) go only through fenced RPCs
 * (G3-TCB / G4-L, docs/decisions/PREMIUM_RETENTION_FENCING_CONTRACT.md).
 * Storage DELETE remains outside DB transactions; lease does not fence Storage (G4-P).
 *
 * OD-62-06: TTL/heartbeat remain PROVISIONAL HOLD — no production defaults here.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createPremiumRetentionWorkerClient } from "@/lib/supabase/premium-retention-worker-client";

/** Singleton lock key — must match migration seed. */
export const PREMIUM_RETENTION_LEASE_LOCK_KEY = "premium_retention_cleanup";

export const PREMIUM_RETENTION_LEASE_RPC = {
  acquire: "premium_retention_lease_acquire",
  renew: "premium_retention_lease_renew",
  release: "premium_retention_lease_release",
  get: "premium_retention_lease_get",
  /** H2-4 L2 — atomic EXPIRED CAS under lease fence. */
  markExpiredIfLease: "premium_retention_mark_expired_if_lease",
  /** G4-L — atomic linked-artifact soft-delete under lease fence. */
  softDeleteArtifactIfLease: "premium_retention_soft_delete_artifact_if_lease",
} as const;

/**
 * OD-62-06 remains PROVISIONAL HOLD.
 * This flag documents that no Owner-approved production TTL exists in this module.
 */
export const PREMIUM_RETENTION_LEASE_OD62_06_PROVISIONAL_HOLD = true as const;

/**
 * Test-only TTL seconds for mocked/unit suites.
 * NOT an Owner-approved production default. NOT activate-ready.
 */
export const PREMIUM_RETENTION_LEASE_TEST_ONLY_TTL_SECONDS = 30;

export type PremiumRetentionLeaseAcquireReason =
  | "ACQUIRED"
  | "ALREADY_HELD"
  | "HELD";

export type PremiumRetentionLeaseRenewReason = "RENEWED" | "LEASE_LOST";

export type PremiumRetentionLeaseReleaseReason = "RELEASED" | "NOT_HOLDER";

export type PremiumRetentionMarkExpiredReason =
  | "MARKED_EXPIRED"
  | "LEASE_MISSING"
  | "LEASE_EXPIRED"
  | "LEASE_MISMATCH"
  | "STALE_TOKEN"
  | "WORK_NOT_FOUND"
  | "ALREADY_EXPIRED"
  | "NOT_WORK_READY"
  | "RETENTION_NOT_DUE"
  | "CAS_CONFLICT";

export type PremiumRetentionMarkExpiredResult = {
  ok: boolean;
  reason: PremiumRetentionMarkExpiredReason;
  workId: string | null;
};

export type PremiumRetentionSoftDeleteReason =
  | "SOFT_DELETED"
  | "ALREADY_DELETED"
  | "LEASE_MISSING"
  | "LEASE_EXPIRED"
  | "LEASE_MISMATCH"
  | "STALE_TOKEN"
  | "WORK_NOT_FOUND"
  | "NOT_WORK_READY"
  | "RETENTION_NOT_DUE"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACT_NOT_LINKED"
  | "CAS_CONFLICT";

export type PremiumRetentionSoftDeleteResult = {
  ok: boolean;
  reason: PremiumRetentionSoftDeleteReason;
  artifactId: string | null;
};

/** Fence rejection reasons shared by every fenced RPC. */
export const PREMIUM_RETENTION_LEASE_LOST_REASONS: ReadonlySet<string> = new Set([
  "LEASE_MISSING",
  "LEASE_EXPIRED",
  "LEASE_MISMATCH",
  "STALE_TOKEN",
]);

/** Valid fence shape: non-empty runId and non-negative integer token. */
export function isValidPremiumRetentionLeaseFence(
  fence: PremiumRetentionLeaseFence | null | undefined,
): fence is PremiumRetentionLeaseFence {
  return (
    fence != null &&
    typeof fence.runId === "string" &&
    fence.runId.trim().length > 0 &&
    Number.isInteger(fence.fencingToken) &&
    fence.fencingToken >= 0
  );
}

/** Fence identity required for L2 EXPIRED mark (scheduler → executor). */
export type PremiumRetentionLeaseFence = {
  runId: string;
  fencingToken: number;
};

export type PremiumRetentionLeaseAcquireResult = {
  acquired: boolean;
  reason: PremiumRetentionLeaseAcquireReason;
  fencingToken: number | null;
  leaseExpiresAt: string | null;
  holderRunId: string | null;
};

export type PremiumRetentionLeaseRenewResult = {
  renewed: boolean;
  reason: PremiumRetentionLeaseRenewReason;
  fencingToken: number | null;
  leaseExpiresAt: string | null;
  holderRunId: string | null;
};

export type PremiumRetentionLeaseReleaseResult = {
  released: boolean;
  reason: PremiumRetentionLeaseReleaseReason;
  fencingToken: number | null;
};

export type PremiumRetentionLeaseSnapshot = {
  lockKey: string;
  fencingToken: number;
  holderRunId: string | null;
  leaseExpiresAt: string | null;
  acquiredAt: string | null;
  heartbeatAt: string | null;
  isExpired: boolean;
};

export type PremiumRetentionLeaseTransportError = {
  status: "error";
  errorClass:
    | "VALIDATION"
    | "PERMISSION"
    | "UNAVAILABLE"
    | "INVALID_RESPONSE"
    | "UNKNOWN";
  message: string;
};

export type PremiumRetentionLeaseAmbiguous = {
  status: "ambiguous";
  operation:
    | "acquire"
    | "renew"
    | "release"
    | "get"
    | "markExpiredIfLease"
    | "softDeleteArtifactIfLease";
  message: string;
};

export type PremiumRetentionLeaseOk<T> = {
  status: "ok";
  value: T;
};

export type PremiumRetentionLeaseCallResult<T> =
  | PremiumRetentionLeaseOk<T>
  | PremiumRetentionLeaseTransportError
  | PremiumRetentionLeaseAmbiguous;

export type PremiumRetentionLeaseRpcDeps = {
  rpc: SupabaseClient["rpc"];
};

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const row = data[0];
    return row && typeof row === "object"
      ? (row as Record<string, unknown>)
      : null;
  }
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return null;
}

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asUuid(value: unknown): string | null {
  if (value == null) return null;
  return String(value);
}

function asToken(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

const MARK_EXPIRED_REASONS: ReadonlySet<string> = new Set([
  "MARKED_EXPIRED",
  "LEASE_MISSING",
  "LEASE_EXPIRED",
  "LEASE_MISMATCH",
  "STALE_TOKEN",
  "WORK_NOT_FOUND",
  "ALREADY_EXPIRED",
  "NOT_WORK_READY",
  "RETENTION_NOT_DUE",
  "CAS_CONFLICT",
]);

function mapMarkExpiredRow(
  row: Record<string, unknown>,
): PremiumRetentionMarkExpiredResult | null {
  const reason = String(row.reason ?? "");
  if (!MARK_EXPIRED_REASONS.has(reason)) return null;
  return {
    ok: Boolean(row.ok),
    reason: reason as PremiumRetentionMarkExpiredReason,
    workId: asUuid(row.work_id),
  };
}

const SOFT_DELETE_OK_REASONS: ReadonlySet<string> = new Set([
  "SOFT_DELETED",
  "ALREADY_DELETED",
]);

const SOFT_DELETE_REASONS: ReadonlySet<string> = new Set([
  ...SOFT_DELETE_OK_REASONS,
  "LEASE_MISSING",
  "LEASE_EXPIRED",
  "LEASE_MISMATCH",
  "STALE_TOKEN",
  "WORK_NOT_FOUND",
  "NOT_WORK_READY",
  "RETENTION_NOT_DUE",
  "ARTIFACT_NOT_FOUND",
  "ARTIFACT_NOT_LINKED",
  "CAS_CONFLICT",
]);

function mapSoftDeleteRow(
  row: Record<string, unknown>,
): PremiumRetentionSoftDeleteResult | null {
  const reason = String(row.reason ?? "");
  if (!SOFT_DELETE_REASONS.has(reason)) return null;
  return {
    ok: Boolean(row.ok),
    reason: reason as PremiumRetentionSoftDeleteReason,
    artifactId: asUuid(row.artifact_id),
  };
}

function classifyRpcError(message: string): PremiumRetentionLeaseTransportError["errorClass"] {
  if (
    /run_id required|work_id required|artifact_id required|ttl_seconds must be positive|fencing_token required/i.test(
      message,
    )
  ) {
    return "VALIDATION";
  }
  if (/Only service_role|permission denied|42501/i.test(message)) {
    return "PERMISSION";
  }
  if (/does not exist|schema cache|PGRST202/i.test(message)) {
    return "UNAVAILABLE";
  }
  return "UNKNOWN";
}

function isAmbiguousTransportFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("timed out") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("econnreset") ||
    msg.includes("socket") ||
    msg.includes("aborted")
  );
}

function validateRunId(runId: string): string | null {
  const trimmed = runId.trim();
  if (!trimmed) return "run_id required";
  return null;
}

function validateTtlSeconds(ttlSeconds: number): string | null {
  if (!Number.isFinite(ttlSeconds) || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    return "ttl_seconds must be positive integer";
  }
  return null;
}

function validateFencingToken(token: number): string | null {
  if (!Number.isFinite(token) || !Number.isInteger(token) || token < 0) {
    return "fencing_token must be a non-negative integer";
  }
  return null;
}

function mapAcquireRow(row: Record<string, unknown>): PremiumRetentionLeaseAcquireResult | null {
  const reason = String(row.reason ?? "");
  if (reason !== "ACQUIRED" && reason !== "ALREADY_HELD" && reason !== "HELD") {
    return null;
  }
  return {
    acquired: Boolean(row.acquired),
    reason,
    fencingToken: asToken(row.fencing_token),
    leaseExpiresAt: asIso(row.lease_expires_at),
    holderRunId: asUuid(row.holder_run_id),
  };
}

function mapRenewRow(row: Record<string, unknown>): PremiumRetentionLeaseRenewResult | null {
  const reason = String(row.reason ?? "");
  if (reason !== "RENEWED" && reason !== "LEASE_LOST") return null;
  return {
    renewed: Boolean(row.renewed),
    reason,
    fencingToken: asToken(row.fencing_token),
    leaseExpiresAt: asIso(row.lease_expires_at),
    holderRunId: asUuid(row.holder_run_id),
  };
}

function mapReleaseRow(row: Record<string, unknown>): PremiumRetentionLeaseReleaseResult | null {
  const reason = String(row.reason ?? "");
  if (reason !== "RELEASED" && reason !== "NOT_HOLDER") return null;
  return {
    released: Boolean(row.released),
    reason,
    fencingToken: asToken(row.fencing_token),
  };
}

function mapGetRow(row: Record<string, unknown>): PremiumRetentionLeaseSnapshot | null {
  const lockKey = String(row.lock_key ?? "");
  const fencingToken = asToken(row.fencing_token);
  if (!lockKey || fencingToken == null) return null;
  return {
    lockKey,
    fencingToken,
    holderRunId: asUuid(row.holder_run_id),
    leaseExpiresAt: asIso(row.lease_expires_at),
    acquiredAt: asIso(row.acquired_at),
    heartbeatAt: asIso(row.heartbeat_at),
    isExpired: Boolean(row.is_expired),
  };
}

/**
 * After an ambiguous acquire: probe then, if needed, idempotent re-acquire.
 * Never treats unknown transport as confirmed ownership without evidence.
 */
export async function resolveAmbiguousAcquire(params: {
  runId: string;
  ttlSeconds: number;
  get: () => Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseSnapshot>>;
  acquire: (args: {
    runId: string;
    ttlSeconds: number;
  }) => Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseAcquireResult>>;
}): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseAcquireResult>> {
  const probe = await params.get();
  if (probe.status !== "ok") return probe;

  const snap = probe.value;
  if (
    snap.holderRunId === params.runId &&
    !snap.isExpired &&
    snap.leaseExpiresAt != null
  ) {
    return {
      status: "ok",
      value: {
        acquired: true,
        reason: "ALREADY_HELD",
        fencingToken: snap.fencingToken,
        leaseExpiresAt: snap.leaseExpiresAt,
        holderRunId: snap.holderRunId,
      },
    };
  }

  // Not clearly ours — safe idempotent re-attempt (same runId will not double-bump if we won).
  return params.acquire({
    runId: params.runId,
    ttlSeconds: params.ttlSeconds,
  });
}

/**
 * After an ambiguous renew: probe. Continue only if still holder with same token.
 */
export async function resolveAmbiguousRenew(params: {
  runId: string;
  fencingToken: number;
  get: () => Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseSnapshot>>;
}): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseRenewResult>> {
  const probe = await params.get();
  if (probe.status !== "ok") return probe;

  const snap = probe.value;
  if (
    snap.holderRunId === params.runId &&
    snap.fencingToken === params.fencingToken &&
    !snap.isExpired
  ) {
    return {
      status: "ok",
      value: {
        renewed: true,
        reason: "RENEWED",
        fencingToken: snap.fencingToken,
        leaseExpiresAt: snap.leaseExpiresAt,
        holderRunId: snap.holderRunId,
      },
    };
  }

  return {
    status: "ok",
    value: {
      renewed: false,
      reason: "LEASE_LOST",
      fencingToken: null,
      leaseExpiresAt: null,
      holderRunId: null,
    },
  };
}

export function createPremiumRetentionLeaseClient(
  deps?: PremiumRetentionLeaseRpcDeps,
) {
  const rpc =
    deps?.rpc ??
    ((fn: string, args?: Record<string, unknown>) =>
      createPremiumRetentionWorkerClient().rpc(fn, args));

  async function acquire(input: {
    runId: string;
    ttlSeconds: number;
  }): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseAcquireResult>> {
    const runErr = validateRunId(input.runId);
    if (runErr) {
      return { status: "error", errorClass: "VALIDATION", message: runErr };
    }
    const ttlErr = validateTtlSeconds(input.ttlSeconds);
    if (ttlErr) {
      return { status: "error", errorClass: "VALIDATION", message: ttlErr };
    }

    try {
      const { data, error } = await rpc(PREMIUM_RETENTION_LEASE_RPC.acquire, {
        p_run_id: input.runId.trim(),
        p_ttl_seconds: input.ttlSeconds,
      });
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapAcquireRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid acquire RPC response",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "acquire",
          message: err instanceof Error ? err.message : "acquire transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message: err instanceof Error ? err.message : "acquire failed",
      };
    }
  }

  async function renew(input: {
    runId: string;
    fencingToken: number;
    ttlSeconds: number;
  }): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseRenewResult>> {
    const runErr = validateRunId(input.runId);
    if (runErr) {
      return { status: "error", errorClass: "VALIDATION", message: runErr };
    }
    const tokenErr = validateFencingToken(input.fencingToken);
    if (tokenErr) {
      return { status: "error", errorClass: "VALIDATION", message: tokenErr };
    }
    const ttlErr = validateTtlSeconds(input.ttlSeconds);
    if (ttlErr) {
      return { status: "error", errorClass: "VALIDATION", message: ttlErr };
    }

    try {
      const { data, error } = await rpc(PREMIUM_RETENTION_LEASE_RPC.renew, {
        p_run_id: input.runId.trim(),
        p_fencing_token: input.fencingToken,
        p_ttl_seconds: input.ttlSeconds,
      });
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapRenewRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid renew RPC response",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "renew",
          message: err instanceof Error ? err.message : "renew transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message: err instanceof Error ? err.message : "renew failed",
      };
    }
  }

  async function release(input: {
    runId: string;
    fencingToken: number;
  }): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionLeaseReleaseResult>> {
    const runErr = validateRunId(input.runId);
    if (runErr) {
      return { status: "error", errorClass: "VALIDATION", message: runErr };
    }
    const tokenErr = validateFencingToken(input.fencingToken);
    if (tokenErr) {
      return { status: "error", errorClass: "VALIDATION", message: tokenErr };
    }

    try {
      const { data, error } = await rpc(PREMIUM_RETENTION_LEASE_RPC.release, {
        p_run_id: input.runId.trim(),
        p_fencing_token: input.fencingToken,
      });
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapReleaseRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid release RPC response",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "release",
          message: err instanceof Error ? err.message : "release transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message: err instanceof Error ? err.message : "release failed",
      };
    }
  }

  async function markExpiredIfLease(input: {
    workId: string;
    runId: string;
    fencingToken: number;
  }): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionMarkExpiredResult>> {
    const workId = input.workId.trim();
    if (!workId) {
      return {
        status: "error",
        errorClass: "VALIDATION",
        message: "work_id required",
      };
    }
    const runErr = validateRunId(input.runId);
    if (runErr) {
      return { status: "error", errorClass: "VALIDATION", message: runErr };
    }
    const tokenErr = validateFencingToken(input.fencingToken);
    if (tokenErr) {
      return { status: "error", errorClass: "VALIDATION", message: tokenErr };
    }

    try {
      const { data, error } = await rpc(
        PREMIUM_RETENTION_LEASE_RPC.markExpiredIfLease,
        {
          p_work_id: workId,
          p_run_id: input.runId.trim(),
          p_fencing_token: input.fencingToken,
        },
      );
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapMarkExpiredRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid markExpiredIfLease RPC response",
        };
      }
      // Contract honesty: ok must match MARKED_EXPIRED only.
      if (mapped.ok !== (mapped.reason === "MARKED_EXPIRED")) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Inconsistent markExpiredIfLease ok/reason",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "markExpiredIfLease",
          message:
            err instanceof Error
              ? err.message
              : "markExpiredIfLease transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message: err instanceof Error ? err.message : "markExpiredIfLease failed",
      };
    }
  }

  async function softDeleteArtifactIfLease(input: {
    workId: string;
    artifactId: string;
    runId: string;
    fencingToken: number;
  }): Promise<PremiumRetentionLeaseCallResult<PremiumRetentionSoftDeleteResult>> {
    const workId = input.workId.trim();
    if (!workId) {
      return { status: "error", errorClass: "VALIDATION", message: "work_id required" };
    }
    const artifactId = input.artifactId.trim();
    if (!artifactId) {
      return {
        status: "error",
        errorClass: "VALIDATION",
        message: "artifact_id required",
      };
    }
    const runErr = validateRunId(input.runId);
    if (runErr) {
      return { status: "error", errorClass: "VALIDATION", message: runErr };
    }
    const tokenErr = validateFencingToken(input.fencingToken);
    if (tokenErr) {
      return { status: "error", errorClass: "VALIDATION", message: tokenErr };
    }

    try {
      const { data, error } = await rpc(
        PREMIUM_RETENTION_LEASE_RPC.softDeleteArtifactIfLease,
        {
          p_work_id: workId,
          p_artifact_id: artifactId,
          p_run_id: input.runId.trim(),
          p_fencing_token: input.fencingToken,
        },
      );
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapSoftDeleteRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid softDeleteArtifactIfLease RPC response",
        };
      }
      if (mapped.ok !== SOFT_DELETE_OK_REASONS.has(mapped.reason)) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Inconsistent softDeleteArtifactIfLease ok/reason",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "softDeleteArtifactIfLease",
          message:
            err instanceof Error
              ? err.message
              : "softDeleteArtifactIfLease transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message:
          err instanceof Error ? err.message : "softDeleteArtifactIfLease failed",
      };
    }
  }

  async function get(): Promise<
    PremiumRetentionLeaseCallResult<PremiumRetentionLeaseSnapshot>
  > {
    try {
      const { data, error } = await rpc(PREMIUM_RETENTION_LEASE_RPC.get);
      if (error) {
        return {
          status: "error",
          errorClass: classifyRpcError(error.message),
          message: error.message,
        };
      }
      const row = firstRow(data);
      const mapped = row ? mapGetRow(row) : null;
      if (!mapped) {
        return {
          status: "error",
          errorClass: "INVALID_RESPONSE",
          message: "Invalid get RPC response",
        };
      }
      return { status: "ok", value: mapped };
    } catch (err) {
      if (isAmbiguousTransportFailure(err)) {
        return {
          status: "ambiguous",
          operation: "get",
          message: err instanceof Error ? err.message : "get transport ambiguous",
        };
      }
      return {
        status: "error",
        errorClass: "UNKNOWN",
        message: err instanceof Error ? err.message : "get failed",
      };
    }
  }

  return {
    acquire,
    renew,
    release,
    get,
    markExpiredIfLease,
    softDeleteArtifactIfLease,
    resolveAmbiguousAcquire: (input: { runId: string; ttlSeconds: number }) =>
      resolveAmbiguousAcquire({
        runId: input.runId,
        ttlSeconds: input.ttlSeconds,
        get,
        acquire,
      }),
    resolveAmbiguousRenew: (input: { runId: string; fencingToken: number }) =>
      resolveAmbiguousRenew({
        runId: input.runId,
        fencingToken: input.fencingToken,
        get,
      }),
  };
}

export type PremiumRetentionLeaseClient = ReturnType<
  typeof createPremiumRetentionLeaseClient
>;
