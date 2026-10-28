/**
 * Mix Working Plane — request fingerprint (A1).
 * Distinct from document digest. Order of ops is significant.
 */

import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "@/lib/audio/studio-export-document-snapshot";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";

export const MIX_WORKING_REQUEST_FINGERPRINT_VERSION = 1 as const;
/** Restore intent fingerprint — tip-independent (A2.2). */
export const MIX_WORKING_RESTORE_FINGERPRINT_VERSION = 1 as const;

export type MixWorkingRequestFingerprintPayload = {
  v: typeof MIX_WORKING_REQUEST_FINGERPRINT_VERSION;
  expectedDocumentVersion: number;
  ops: MixWorkingOp[];
};

export type MixWorkingRestoreFingerprintPayload = {
  v: typeof MIX_WORKING_RESTORE_FINGERPRINT_VERSION;
  kind: "restore";
  expectedDocumentVersion: number;
  restoredFromRevisionId: string;
};

/**
 * SHA-256 hex of canonical JSON over { v, expectedDocumentVersion, ops }.
 * Ops are not re-sorted — apply order is part of the contract.
 */
export function fingerprintMixWorkingRequest(params: {
  expectedDocumentVersion: number;
  ops: readonly MixWorkingOp[];
}): string {
  const payload: MixWorkingRequestFingerprintPayload = {
    v: MIX_WORKING_REQUEST_FINGERPRINT_VERSION,
    expectedDocumentVersion: params.expectedDocumentVersion,
    ops: [...params.ops],
  };
  const canonical = canonicalJsonStringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Stable fingerprint for restore requests.
 * Does not depend on tip-derived ops (required for idempotent retry after tip matches).
 */
export function fingerprintMixWorkingRestoreRequest(params: {
  expectedDocumentVersion: number;
  restoredFromRevisionId: string;
}): string {
  const payload: MixWorkingRestoreFingerprintPayload = {
    v: MIX_WORKING_RESTORE_FINGERPRINT_VERSION,
    kind: "restore",
    expectedDocumentVersion: params.expectedDocumentVersion,
    restoredFromRevisionId: params.restoredFromRevisionId.toLowerCase(),
  };
  const canonical = canonicalJsonStringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
