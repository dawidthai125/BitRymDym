/**
 * FAR-01 Backfill — OD-ATT-01 = A2 Signed GO artifact.
 *
 * Trust boundary: LIVE runner verifies the artifact, then passes an opaque
 * Far01VerifiedLiveGrant into the library. A plain `{ backfillGo: true }`
 * is NEVER sufficient proof of production GO.
 *
 * OD-BF-08 remains a separate gate: a valid signature does not by itself
 * mean Backfill GO was granted for production execution — Owner issues the
 * artifact only when OD-BF-08 is YES. Verification still default-denies
 * missing/invalid/expired/wrong-scope artifacts.
 *
 * Operational prerequisite: Owner holds the Ed25519 private key offline.
 * Only the public key is configured on the LIVE runner. Never commit
 * production private keys or real GO artifacts with live signatures.
 */

import { sign as nodeSign, verify as nodeVerify, type KeyObject } from "node:crypto";

import { Far01BackfillAuthorizationError } from "./errors";

declare const Far01VerifiedLiveGrantBrand: unique symbol;

/** Opaque grant — constructible only via verifyFar01SignedGoArtifact. */
export type Far01VerifiedLiveGrant = {
  readonly [Far01VerifiedLiveGrantBrand]: true;
  readonly batchScope: string;
  readonly canaryN: number;
  readonly issuer: string;
  readonly expiresAt: string;
  readonly go: true;
};

/** Wire format of the signed Owner GO artifact (OD-ATT-01 A2). */
export type Far01SignedGoArtifact = {
  go: boolean;
  batch_scope: string;
  expires_at: string;
  canary_n: number;
  issuer: string;
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
  /** Clock for expiry check (injectable for tests). */
  now?: Date;
};

const BRAND = Symbol.for("bitrymdym.far01.VerifiedLiveGrant");

function brandGrant(params: {
  batchScope: string;
  canaryN: number;
  issuer: string;
  expiresAt: string;
}): Far01VerifiedLiveGrant {
  const grant = {
    [BRAND]: true as const,
    batchScope: params.batchScope,
    canaryN: params.canaryN,
    issuer: params.issuer,
    expiresAt: params.expiresAt,
    go: true as const,
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
    (value as Far01VerifiedLiveGrant).go === true
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
    batch_scope: artifact.batch_scope,
    expires_at: artifact.expires_at,
    canary_n: artifact.canary_n,
    issuer: artifact.issuer,
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
  const canonical = serializeFar01GoArtifactPayload(params.payload);
  const sig = nodeSign(null, Buffer.from(canonical, "utf8"), params.privateKey);
  return {
    ...params.payload,
    signature: toBase64Url(sig),
  };
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
      "LIVE denied: artifact go !== true (OD-BF-08 / OD-ATT-01)",
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

  const canonical = serializeFar01GoArtifactPayload({
    go: artifact.go,
    batch_scope: artifact.batch_scope,
    expires_at: artifact.expires_at,
    canary_n: artifact.canary_n,
    issuer: artifact.issuer,
  });

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
