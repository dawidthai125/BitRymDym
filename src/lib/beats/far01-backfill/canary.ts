/**
 * FAR-01 Backfill — OD-CANARY-N = 5 · C-IMPL-02 mandatory canary gate.
 *
 * Canary itself does not auto-execute. This module validates limits,
 * selects deterministic canary sets, and gates FLEET behind verified canary.
 */

import { Far01CanaryGateError } from "./errors";
import { sortAssetsForBatch } from "./telemetry";
import type { Far01Action } from "./types";

/** Owner-locked default (OD-CANARY-N). */
export const FAR01_OWNER_CANARY_N = 5 as const;

export type Far01PipelinePhase =
  | "DRY_RUN"
  | "CANARY"
  | "VERIFY"
  | "APPROVAL"
  | "FLEET";

export type Far01CanaryVerificationResult =
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export type Far01VerifiedCanaryResult = {
  batch_id: string;
  selected_asset_ids: string[];
  count: number;
  status: "PASS" | "FAIL";
  failures: string[];
  verification_result: Far01CanaryVerificationResult;
  approved: boolean;
};

/**
 * Validate canaryLimit per OD-CANARY-N locked rules.
 * null / undefined / 0 / negative / non-integer / NaN / N>inventory → DENY.
 */
export function validateCanaryLimit(
  canaryLimit: unknown,
  eligibleMigrateCount: number,
): number {
  if (canaryLimit === null || canaryLimit === undefined) {
    throw new Far01CanaryGateError(
      "canaryLimit required: null/undefined DENY (OD-CANARY-N / C-IMPL-02)",
    );
  }
  if (typeof canaryLimit !== "number" || Number.isNaN(canaryLimit)) {
    throw new Far01CanaryGateError(
      "canaryLimit DENY: NaN or non-number (OD-CANARY-N)",
    );
  }
  if (!Number.isInteger(canaryLimit)) {
    throw new Far01CanaryGateError(
      "canaryLimit DENY: non-integer (OD-CANARY-N)",
    );
  }
  if (canaryLimit < 1) {
    throw new Far01CanaryGateError(
      "canaryLimit DENY: N < 1 (includes 0 and negative) (OD-CANARY-N)",
    );
  }
  if (canaryLimit > eligibleMigrateCount) {
    throw new Far01CanaryGateError(
      `canaryLimit DENY: N (${canaryLimit}) > eligible inventory (${eligibleMigrateCount}) (OD-CANARY-N)`,
    );
  }
  return canaryLimit;
}

export function assertNoImplicitUnlimited(canaryLimit: unknown): void {
  if (canaryLimit === null || canaryLimit === undefined) {
    throw new Far01CanaryGateError(
      "implicit unlimited DENY: canaryLimit must be explicit (OD-CANARY-N)",
    );
  }
}

/** Row shape for deterministic canary selection (OD-CANARY-N). */
export type Far01CanarySelectionRow = {
  id: string;
  created_at?: string;
  action: Far01Action;
  /** Explicit exclusions — any true removes the row from the eligible pool. */
  is_quarantine?: boolean;
  is_canonical?: boolean;
  is_platform?: boolean;
  destination_conflict?: boolean;
  identity_anomaly?: boolean;
  incomplete_evidence?: boolean;
};

/**
 * Eligible canary pool: MIGRATE only, minus quarantine / canonical / platform /
 * destination conflict / identity anomaly / incomplete evidence.
 */
export function isFar01CanaryEligible(row: Far01CanarySelectionRow): boolean {
  if (row.action !== "MIGRATE") return false;
  if (row.is_quarantine === true) return false;
  if (row.is_canonical === true) return false;
  if (row.is_platform === true) return false;
  if (row.destination_conflict === true) return false;
  if (row.identity_anomaly === true) return false;
  if (row.incomplete_evidence === true) return false;
  return true;
}

/**
 * Select first N eligible asset ids after deterministic sort
 * (`created_at` ASC, then `id` ASC). Same inventory → same N ids.
 * Quarantine / FAIL / OWNER_REVIEW / SKIP / flagged exclusions never enter.
 */
export function selectCanaryAssetIds(params: {
  rows: Far01CanarySelectionRow[];
  canaryLimit: number;
}): string[] {
  const eligible = params.rows.filter(isFar01CanaryEligible);
  const limit = validateCanaryLimit(params.canaryLimit, eligible.length);
  const sorted = sortAssetsForBatch(eligible);
  return sorted.slice(0, limit).map((r) => r.id);
}

export function buildCanaryResult(params: {
  batchId: string;
  selectedAssetIds: string[];
  failures?: string[];
  verificationResult?: Far01CanaryVerificationResult;
  approved?: boolean;
}): Far01VerifiedCanaryResult {
  const failures = params.failures ?? [];
  return {
    batch_id: params.batchId,
    selected_asset_ids: [...params.selectedAssetIds],
    count: params.selectedAssetIds.length,
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    verification_result: params.verificationResult ?? "PENDING",
    approved: params.approved ?? false,
  };
}

/**
 * Formal VERIFY artifact for Fleet Pre-GO.
 * Sets verification_result=VERIFIED but approved=false (Approval ≠ Owner GO).
 */
export function buildFar01FleetVerifyCanaryResult(params: {
  canaryBatchId: string;
  selectedAssetIds: string[];
  failures?: string[];
}): Far01VerifiedCanaryResult {
  return buildCanaryResult({
    batchId: params.canaryBatchId,
    selectedAssetIds: params.selectedAssetIds,
    failures: params.failures,
    verificationResult: "VERIFIED",
    approved: false,
  });
}

/**
 * Formal APPROVAL placeholder — remains DENY for FLEET until Owner GO
 * flips approved=true on a separate authorization step.
 */
export function buildFar01FleetApprovalPendingResult(params: {
  verify: Far01VerifiedCanaryResult;
}): Far01VerifiedCanaryResult {
  if (params.verify.verification_result !== "VERIFIED") {
    throw new Far01CanaryGateError(
      "APPROVAL DENY: VERIFY required before APPROVAL placeholder",
    );
  }
  if (params.verify.status !== "PASS") {
    throw new Far01CanaryGateError(
      "APPROVAL DENY: canary status is not PASS",
    );
  }
  return {
    ...params.verify,
    verification_result: "VERIFIED",
    approved: false,
  };
}

/** VERIFY → APPROVAL → FLEET gates. */
export function assertFleetPhaseAllowed(params: {
  phase: Far01PipelinePhase;
  verifiedCanary: Far01VerifiedCanaryResult | null | undefined;
}): void {
  if (params.phase !== "FLEET") {
    return;
  }
  if (!params.verifiedCanary) {
    throw new Far01CanaryGateError(
      "FLEET DENY: missing verified canary (OD-CANARY-N)",
    );
  }
  if (params.verifiedCanary.verification_result !== "VERIFIED") {
    throw new Far01CanaryGateError(
      "FLEET DENY: canary not VERIFIED (VERIFY before APPROVAL before FLEET)",
    );
  }
  if (!params.verifiedCanary.approved) {
    throw new Far01CanaryGateError(
      "FLEET DENY: canary not APPROVED (APPROVAL before FLEET)",
    );
  }
  if (params.verifiedCanary.status !== "PASS") {
    throw new Far01CanaryGateError(
      "FLEET DENY: canary status is not PASS",
    );
  }
}

export function assertPipelinePhaseOrder(params: {
  phase: Far01PipelinePhase;
  verifiedCanary?: Far01VerifiedCanaryResult | null;
}): void {
  if (params.phase === "APPROVAL") {
    if (params.verifiedCanary?.verification_result !== "VERIFIED") {
      throw new Far01CanaryGateError(
        "APPROVAL DENY: VERIFY required before APPROVAL",
      );
    }
  }
  if (params.phase === "FLEET") {
    assertFleetPhaseAllowed({
      phase: "FLEET",
      verifiedCanary: params.verifiedCanary,
    });
  }
}
