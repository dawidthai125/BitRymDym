/**
 * FAR-01 Backfill — OD-ATT-01 = A2 Signed GO artifact.
 *
 * Trust boundary: LIVE runner verifies the artifact, then passes an opaque
 * Far01VerifiedLiveGrant into the library. A plain `{ backfillGo: true }`
 * is NEVER sufficient proof of production GO.
 *
 * OD-BF-08 remains a separate gate: a valid A2 signature does **not** mean
 * Backfill GO. Field `od_bf_08` on the artifact MUST be `false`. Owner issues
 * a separate OD-BF-08 decision before any LIVE runner is allowed to execute.
 *
 * Operational prerequisite: Owner holds the Ed25519 private key offline.
 * Only the public key is configured on the LIVE runner. Never commit
 * production private keys or real GO artifacts with live signatures.
 */

import { sign as nodeSign, verify as nodeVerify, type KeyObject } from "node:crypto";

import { Far01BackfillAuthorizationError } from "./errors";
import { FAR01_OWNER_CANARY_N } from "./canary";

declare const Far01VerifiedLiveGrantBrand: unique symbol;

/** Opaque grant — constructible only via verifyFar01SignedGoArtifact. */
export type Far01VerifiedLiveGrant = {
  readonly [Far01VerifiedLiveGrantBrand]: true;
  readonly batchScope: string;
  readonly canaryN: number;
  readonly issuer: string;
  readonly expiresAt: string;
  readonly phase: "CANARY";
  readonly gitSha: string;
  readonly operatorId: string;
  readonly eligibleCandidateCount: number;
  readonly quarantineCount: number;
  readonly go: true;
  /** Always false on verified grants — OD-BF-08 is a separate Owner gate. */
  readonly odBf08: false;
};

/** LIVE execution phase bound into the signed artifact. */
export type Far01GoArtifactPhase = "CANARY";

/**
 * Wire format of the signed Owner GO artifact (OD-ATT-01 A2).
 * Evidence-binding fields pin the artifact to a concrete readiness snapshot.
 */
export type Far01SignedGoArtifact = {
  go: boolean;
  /** MUST be false — A2 artifact ≠ Backfill GO (OD-BF-08). */
  od_bf_08: boolean;
  phase: Far01GoArtifactPhase;
  batch_scope: string;
  expires_at: string;
  canary_n: number;
  issuer: string;
  operator_id: string;
  git_sha: string;
  eligible_candidate_count: number;
  quarantine_count: number;
  inventory_legacy: number;
  inventory_canonical: number;
  inventory_platform: number;
  inventory_orphan: number;
  evidence_dry_run_id: string;
  evidence_checksum_campaign_id: string;
  /** Base64url Ed25519 signature over canonical serialization. */
  signature: string;
};

export type Far01GoVerifyOptions = {
  /** Ed25519 public key (KeyObject or PEM/SPKI Buffer). */
  publicKey: KeyObject | string | Buffer;
  /** Required batch_scope exact match. */
  expectedBatchScope: string;
  /** Allowed issuer ids (exact match). */
  allowedIssuers: readonly string[];
  /** Expected evidence binding (production readiness snapshot). */
  expectedEvidence: Far01GoEvidenceBinding;
  /** Clock for expiry check (injectable for tests). */
  now?: Date;
};

/** Evidence binding expected by the LIVE runner at verify time. */
export type Far01GoEvidenceBinding = {
  phase: Far01GoArtifactPhase;
  canary_n: number;
  eligible_candidate_count: number;
  quarantine_count: number;
  inventory_legacy: number;
  inventory_canonical: number;
  inventory_platform: number;
  inventory_orphan: number;
  evidence_dry_run_id: string;
  evidence_checksum_campaign_id: string;
  /** When set, artifact git_sha must equal this value. */
  git_sha?: string;
  /** When set, artifact operator_id must equal this value. */
  operator_id?: string;
};

/**
 * Production readiness snapshot for Gate C / LIVE canary (evidence pins).
 * Historical pre-canary pins — keep for canary replay / tests.
 * Not a Backfill GO. Not a live signed artifact.
 */
export const FAR01_GATE_C_EVIDENCE_BINDING_V1: Far01GoEvidenceBinding = {
  phase: "CANARY",
  canary_n: FAR01_OWNER_CANARY_N,
  eligible_candidate_count: 67,
  quarantine_count: 1,
  inventory_legacy: 68,
  inventory_canonical: 2,
  inventory_platform: 3,
  inventory_orphan: 28,
  evidence_dry_run_id: "far01-bf-2026-10-02T23-37-58-039Z",
  evidence_checksum_campaign_id: "far01-checksum-campaign-2026-10-03",
};

/**
 * Post-canary Fleet Pre-GO evidence pins (live inventory after Canary N=5).
 * A2 wire `phase` remains CANARY (artifact schema); pipeline FLEET is gated
 * separately via Far01VerifiedCanaryResult VERIFY→APPROVAL→Owner GO.
 * od_bf_08 stays false — not Backfill GO.
 */
export const FAR01_FLEET_EVIDENCE_BINDING_V1: Far01GoEvidenceBinding = {
  phase: "CANARY",
  canary_n: FAR01_OWNER_CANARY_N,
  eligible_candidate_count: 62,
  quarantine_count: 1,
  inventory_legacy: 63,
  inventory_canonical: 7,
  inventory_platform: 3,
  inventory_orphan: 33,
  evidence_dry_run_id: "far01-bf-2026-10-02T23-37-58-039Z",
  evidence_checksum_campaign_id: "far01-checksum-campaign-2026-10-03",
};

/** Canary execution batch referenced by Fleet Pre-GO VERIFY (evidence only). */
export const FAR01_CANARY_EVIDENCE_BATCH_ID =
  "far01-bf-2026-10-03T04-06-42-045Z" as const;

const BRAND = Symbol.for("bitrymdym.far01.VerifiedLiveGrant");

function brandGrant(params: {
  batchScope: string;
  canaryN: number;
  issuer: string;
  expiresAt: string;
  phase: "CANARY";
  gitSha: string;
  operatorId: string;
  eligibleCandidateCount: number;
  quarantineCount: number;
}): Far01VerifiedLiveGrant {
  const grant = {
    [BRAND]: true as const,
    batchScope: params.batchScope,
    canaryN: params.canaryN,
    issuer: params.issuer,
    expiresAt: params.expiresAt,
    phase: params.phase,
    gitSha: params.gitSha,
    operatorId: params.operatorId,
    eligibleCandidateCount: params.eligibleCandidateCount,
    quarantineCount: params.quarantineCount,
    go: true as const,
    odBf08: false as const,
  };
  return grant as unknown as Far01VerifiedLiveGrant;
}

export function isFar01VerifiedLiveGrant(
  value: unknown,
): value is Far01VerifiedLiveGrant {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { [k: symbol]: unknown })[BRAND] === true &&
    (value as Far01VerifiedLiveGrant).go === true &&
    (value as Far01VerifiedLiveGrant).odBf08 === false
  );
}

/**
 * Canonical serialization for signing/verification.
 * Fixed key order — do not pretty-print or reorder.
 */
export function serializeFar01GoArtifactPayload(
  artifact: Omit<Far01SignedGoArtifact, "signature">,
): string {
  return JSON.stringify({
    go: artifact.go,
    od_bf_08: artifact.od_bf_08,
    phase: artifact.phase,
    batch_scope: artifact.batch_scope,
    expires_at: artifact.expires_at,
    canary_n: artifact.canary_n,
    issuer: artifact.issuer,
    operator_id: artifact.operator_id,
    git_sha: artifact.git_sha,
    eligible_candidate_count: artifact.eligible_candidate_count,
    quarantine_count: artifact.quarantine_count,
    inventory_legacy: artifact.inventory_legacy,
    inventory_canonical: artifact.inventory_canonical,
    inventory_platform: artifact.inventory_platform,
    inventory_orphan: artifact.inventory_orphan,
    evidence_dry_run_id: artifact.evidence_dry_run_id,
    evidence_checksum_campaign_id: artifact.evidence_checksum_campaign_id,
  });
}

/**
 * Build unsigned A2 payload pinned to Gate C evidence binding.
 * Does NOT create a production GO — Owner must sign for the intended LIVE stage.
 * od_bf_08 remains false (A2 ≠ Backfill GO / OD-BF-08).
 */
export function buildFar01GateCCanaryGoPayload(params: {
  issuer: string;
  operatorId: string;
  gitSha: string;
  expiresAt: string;
  batchScope: string;
  binding?: Far01GoEvidenceBinding;
}): Omit<Far01SignedGoArtifact, "signature"> {
  const b = params.binding ?? FAR01_GATE_C_EVIDENCE_BINDING_V1;
  return {
    go: true,
    od_bf_08: false,
    phase: b.phase,
    batch_scope: params.batchScope,
    expires_at: params.expiresAt,
    canary_n: b.canary_n,
    issuer: params.issuer,
    operator_id: params.operatorId,
    git_sha: params.gitSha,
    eligible_candidate_count: b.eligible_candidate_count,
    quarantine_count: b.quarantine_count,
    inventory_legacy: b.inventory_legacy,
    inventory_canonical: b.inventory_canonical,
    inventory_platform: b.inventory_platform,
    inventory_orphan: b.inventory_orphan,
    evidence_dry_run_id: b.evidence_dry_run_id,
    evidence_checksum_campaign_id: b.evidence_checksum_campaign_id,
  };
}

/**
 * Build unsigned A2 payload pinned to post-canary Fleet evidence binding.
 * Not Owner GO. Not Backfill GO. Not automatic Fleet authorization.
 */
export function buildFar01FleetGoPayload(params: {
  issuer: string;
  operatorId: string;
  gitSha: string;
  expiresAt: string;
  batchScope: string;
  binding?: Far01GoEvidenceBinding;
}): Omit<Far01SignedGoArtifact, "signature"> {
  return buildFar01GateCCanaryGoPayload({
    ...params,
    binding: params.binding ?? FAR01_FLEET_EVIDENCE_BINDING_V1,
  });
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/**
 * Sign a GO artifact. Intended for Owner offline tooling / tests only.
 * Do not embed production private keys in the application.
 */
export function signFar01GoArtifact(params: {
  payload: Omit<Far01SignedGoArtifact, "signature">;
  privateKey: KeyObject | string | Buffer;
}): Far01SignedGoArtifact {
  if (params.payload.od_bf_08 !== false) {
    throw new Far01BackfillAuthorizationError(
      "Refuse to sign: od_bf_08 must be false (A2 ≠ Backfill GO / OD-BF-08)",
    );
  }
  const canonical = serializeFar01GoArtifactPayload(params.payload);
  const sig = nodeSign(null, Buffer.from(canonical, "utf8"), params.privateKey);
  return {
    ...params.payload,
    signature: toBase64Url(sig),
  };
}

function assertEvidenceMatch(
  artifact: Far01SignedGoArtifact,
  expected: Far01GoEvidenceBinding,
): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["phase", artifact.phase, expected.phase],
    ["canary_n", artifact.canary_n, expected.canary_n],
    [
      "eligible_candidate_count",
      artifact.eligible_candidate_count,
      expected.eligible_candidate_count,
    ],
    ["quarantine_count", artifact.quarantine_count, expected.quarantine_count],
    ["inventory_legacy", artifact.inventory_legacy, expected.inventory_legacy],
    [
      "inventory_canonical",
      artifact.inventory_canonical,
      expected.inventory_canonical,
    ],
    [
      "inventory_platform",
      artifact.inventory_platform,
      expected.inventory_platform,
    ],
    ["inventory_orphan", artifact.inventory_orphan, expected.inventory_orphan],
    [
      "evidence_dry_run_id",
      artifact.evidence_dry_run_id,
      expected.evidence_dry_run_id,
    ],
    [
      "evidence_checksum_campaign_id",
      artifact.evidence_checksum_campaign_id,
      expected.evidence_checksum_campaign_id,
    ],
  ];
  for (const [name, actual, exp] of checks) {
    if (actual !== exp) {
      throw new Far01BackfillAuthorizationError(
        `LIVE denied: evidence binding mismatch on ${name} (OD-ATT-01 A2)`,
      );
    }
  }
  if (expected.git_sha != null && artifact.git_sha !== expected.git_sha) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: git_sha evidence mismatch (OD-ATT-01 A2)",
    );
  }
  if (
    expected.operator_id != null &&
    artifact.operator_id !== expected.operator_id
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: operator_id evidence mismatch (OD-ATT-01 A2)",
    );
  }
}

/**
 * LIVE runner trust boundary — verify signed artifact → opaque grant.
 * Default deny on any failure mode.
 */
export function verifyFar01SignedGoArtifact(
  artifact: Far01SignedGoArtifact | null | undefined,
  options: Far01GoVerifyOptions,
): Far01VerifiedLiveGrant {
  if (artifact == null) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: missing signed GO artifact (OD-ATT-01 A2)",
    );
  }

  if (artifact.go !== true) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: artifact go !== true (OD-ATT-01)",
    );
  }

  if (artifact.od_bf_08 !== false) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: od_bf_08 must be false — A2 artifact is not Backfill GO (OD-BF-08)",
    );
  }

  if (artifact.phase !== "CANARY") {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid phase (expected CANARY)",
    );
  }

  if (
    typeof artifact.batch_scope !== "string" ||
    artifact.batch_scope.length === 0
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid batch_scope",
    );
  }

  if (artifact.batch_scope !== options.expectedBatchScope) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: wrong batch_scope (OD-ATT-01)",
    );
  }

  if (
    typeof artifact.issuer !== "string" ||
    !options.allowedIssuers.includes(artifact.issuer)
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid issuer (OD-ATT-01)",
    );
  }

  if (
    typeof artifact.canary_n !== "number" ||
    !Number.isInteger(artifact.canary_n)
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid canary_n on artifact",
    );
  }

  if (
    typeof artifact.operator_id !== "string" ||
    artifact.operator_id.trim().length === 0
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid operator_id",
    );
  }

  if (
    typeof artifact.git_sha !== "string" ||
    artifact.git_sha.trim().length === 0
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid git_sha",
    );
  }

  assertEvidenceMatch(artifact, options.expectedEvidence);

  const expiresMs = Date.parse(artifact.expires_at);
  if (!Number.isFinite(expiresMs)) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid expires_at",
    );
  }
  const now = options.now ?? new Date();
  if (expiresMs <= now.getTime()) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: expired GO artifact (OD-ATT-01)",
    );
  }

  if (
    typeof artifact.signature !== "string" ||
    artifact.signature.length === 0
  ) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: missing signature (OD-ATT-01)",
    );
  }

  const { signature, ...payload } = artifact;
  void signature;
  const canonical = serializeFar01GoArtifactPayload(payload);

  let ok = false;
  try {
    ok = nodeVerify(
      null,
      Buffer.from(canonical, "utf8"),
      options.publicKey,
      fromBase64Url(artifact.signature),
    );
  } catch {
    ok = false;
  }

  if (!ok) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: invalid signature (OD-ATT-01)",
    );
  }

  return brandGrant({
    batchScope: artifact.batch_scope,
    canaryN: artifact.canary_n,
    issuer: artifact.issuer,
    expiresAt: artifact.expires_at,
    phase: "CANARY",
    gitSha: artifact.git_sha,
    operatorId: artifact.operator_id,
    eligibleCandidateCount: artifact.eligible_candidate_count,
    quarantineCount: artifact.quarantine_count,
  });
}

/**
 * Assert LIVE authorization using opaque verified grant + operator approval.
 * Plain `{ backfillGo: true }` is intentionally ignored / insufficient.
 */
export function assertLiveGrantAuthorized(params: {
  verifiedGrant: Far01VerifiedLiveGrant | null | undefined;
  operatorApproval: boolean;
  /** If a caller still passes legacy boolean — must not alone authorize. */
  legacyBackfillGoBoolean?: boolean;
}): void {
  if (params.legacyBackfillGoBoolean === true && !params.verifiedGrant) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: in-process backfillGo boolean is not sufficient (OD-ATT-01 A2)",
    );
  }
  if (!isFar01VerifiedLiveGrant(params.verifiedGrant)) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: verified signed GO grant required (OD-ATT-01 A2)",
    );
  }
  if (!params.operatorApproval) {
    throw new Far01BackfillAuthorizationError(
      "LIVE denied: operator approval required (OD-BF-06)",
    );
  }
}
