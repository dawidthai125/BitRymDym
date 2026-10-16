/**
 * SFM Stage D / F03b — retention presentation (90d from MASTER_SUCCEEDED).
 * Grant is not a file and does not extend TTL. Paid slot does not extend TTL.
 */

export const SFM_RETENTION_DAYS = 90;

/** All qualities of a version share version.expires_at (set at MASTER SUCCEEDED). */
export function sfmQualitiesShareVersionExpiresAt(): true {
  return true;
}

export function computeSfmExpiresAtFromMasterSucceeded(
  masterSucceededAt: Date | string,
): Date {
  const anchor = new Date(masterSucceededAt);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error("Invalid MASTER_SUCCEEDED timestamp");
  }
  const out = new Date(anchor.getTime());
  out.setUTCDate(out.getUTCDate() + SFM_RETENTION_DAYS);
  return out;
}

/**
 * Artifact expires_at must equal version.expires_at (F03b), never Premium matrix seconds.
 */
export function resolveSfmArtifactExpiresAtIso(params: {
  versionExpiresAt: string | null;
}): string {
  if (params.versionExpiresAt == null) {
    throw new Error("SFM version expires_at required for artifact retention");
  }
  const ms = new Date(params.versionExpiresAt).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error("Invalid version expires_at");
  }
  return new Date(ms).toISOString();
}

/** Paid slot / grant must not extend retention. */
export function paidSlotExtendsSfmRetention(): false {
  return false;
}

export function grantGuaranteesEternalObjectAccess(): false {
  return false;
}

/**
 * After TTL: do not present as current available final file
 * (even if a stale is_current flag survived until janitor).
 */
export function isSfmCurrentArtifactPresentable(params: {
  isCurrent: boolean;
  status: string;
  deletedAt: string | null;
  artifactExpiresAt: string | null;
  versionStatus: string;
  versionExpiresAt: string | null;
  nowMs: number;
}): boolean {
  if (!params.isCurrent) return false;
  if (params.status !== "READY") return false;
  if (params.deletedAt != null) return false;
  if (params.versionStatus === "EXPIRED") return false;
  if (
    params.versionExpiresAt != null &&
    new Date(params.versionExpiresAt).getTime() <= params.nowMs
  ) {
    return false;
  }
  if (
    params.artifactExpiresAt != null &&
    new Date(params.artifactExpiresAt).getTime() <= params.nowMs
  ) {
    return false;
  }
  return true;
}
