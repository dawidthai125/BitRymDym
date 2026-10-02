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

/**
 * Select first N MIGRATE-eligible asset ids after deterministic sort.
 * Quarantine / FAIL / OWNER_REVIEW / SKIP never enter the canary set.
 */
export function selectCanaryAssetIds(params: {
  rows: Array<{ id: string; created_at?: string; action: Far01Action }>;
  canaryLimit: number;
}): string[] {
  const limit = validateCanaryLimit(
    params.canaryLimit,
    params.rows.filter((r) => r.action === "MIGRATE").length,
  );
  const migrateOnly = params.rows.filter((r) => r.action === "MIGRATE");
  const sorted = sortAssetsForBatch(migrateOnly);
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
