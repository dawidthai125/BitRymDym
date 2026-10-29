import { createHash } from "node:crypto";

export const SA07_SOURCE_BUCKET = "beat-audio";
export const SA07_BACKUP_PROVIDER = "aws-s3";
export const SA07_DEFAULT_REGION = "eu-central-1";
export const SA07_DEFAULT_BACKUP_BUCKET = "example-beat-audio-backup";
export const SA07_TOOL_VERSION = "storage-arch-07/0.1.0";
export const SA07_HASH_ALGORITHM = "sha256" as const;
export const SA07_OBJECT_LOCK_MODE = "COMPLIANCE" as const;
export const SA07_RETENTION_DAYS_MIN = 90;

/** Living production beat-audio inventory after ARCH-05 DELETE (2026-10-05). */
export const SA07_EXPECTED_INVENTORY = {
  USER: 8,
  PLATFORM: 3,
  ORPHAN: 0,
  TOTAL: 11,
} as const;

/** Pre-ARCH-05 DELETE snapshot retained for historical backup evidence (43/43 Layer-1/2). */
export const SA07_PRE_ARCH05_INVENTORY = {
  USER: 8,
  PLATFORM: 3,
  ORPHAN: 32,
  TOTAL: 43,
} as const;

export type BackupClassification = "USER" | "PLATFORM" | "ORPHAN" | "UNKNOWN";
export type VerifyStatus = "PENDING" | "MATCH" | "MISMATCH";
export type RestoreDrillStatus = "NOT_RUN" | "PASS" | "FAIL";
export type GcSafetyStatus =
  | "PROPOSED"
  | "BACKED_UP"
  | "RESTORE_VERIFIED"
  | "SAFE"
  | "OWNER_APPROVED"
  | "DELETED"
  | "NOT_SAFE";

export type BackupRunMode = "dry-run" | "backup" | "verify" | "restore-drill";

export type SourceObjectMeta = {
  bucket: string;
  objectKey: string;
  sizeBytes: number;
  contentType: string;
  etag: string | null;
  versionId: string | null;
  lastModified: string;
  dbRefsCount: number;
};

export type BackupManifestRecord = {
  manifest_id: string;
  backup_run_id: string;
  source_bucket: string;
  source_object_key: string;
  source_size_bytes: number;
  source_content_type: string;
  source_sha256: string;
  source_etag: string | null;
  source_version_id: string | null;
  source_last_modified: string;
  classification: BackupClassification;
  db_refs_count: number;
  backup_provider: string;
  backup_bucket: string;
  backup_object_key: string;
  backup_version_id: string;
  backup_sha256: string;
  backup_size_bytes: number;
  backed_up_at: string;
  hash_algorithm: typeof SA07_HASH_ALGORITHM;
  verify_status: VerifyStatus;
  restore_drill_status: RestoreDrillStatus;
  restore_drill_at: string | null;
  gc_safety_status: GcSafetyStatus;
  evidence_path: string;
  operator: string;
  tool_version: string;
};

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function mapBackupObjectKey(sourceObjectKey: string): string {
  return `beat-audio/${sourceObjectKey}`;
}

export function mapEvidenceObjectKey(
  backupRunId: string,
  manifestId: string,
): string {
  return `evidence/${backupRunId}/${manifestId}.json`;
}

export function classifyBeatAudioObject(params: {
  objectKey: string;
  dbRefsCount: number;
}): BackupClassification {
  if (params.dbRefsCount > 0) {
    if (params.objectKey.startsWith("user/")) return "USER";
    if (params.objectKey.startsWith("platform/")) return "PLATFORM";
    return "UNKNOWN";
  }
  return "ORPHAN";
}

export function isInBackupScope(classification: BackupClassification): boolean {
  return (
    classification === "USER" ||
    classification === "PLATFORM" ||
    classification === "ORPHAN"
  );
}

export function verifyIntegrity(params: {
  sourceSha256: string;
  backupSha256: string;
  sourceSize: number;
  backupSize: number;
  sourceKey: string;
  backupMappedKey: string;
}): VerifyStatus {
  const hashesMatch =
    params.sourceSha256 === params.backupSha256 &&
    /^[a-f0-9]{64}$/.test(params.sourceSha256);
  const sizeMatch = params.sourceSize === params.backupSize;
  const keyMatch = mapBackupObjectKey(params.sourceKey) === params.backupMappedKey;
  return hashesMatch && sizeMatch && keyMatch ? "MATCH" : "MISMATCH";
}

export function gcStatusAfterVerify(verify: VerifyStatus): GcSafetyStatus {
  return verify === "MATCH" ? "BACKED_UP" : "NOT_SAFE";
}

export type SafeForGcInput = {
  classification: BackupClassification;
  identityUnambiguous: boolean;
  backupExists: boolean;
  manifestExists: boolean;
  sha256Match: boolean;
  restoreVerified: boolean;
  notLivingUser: boolean;
  notPlatform: boolean;
  notActiveRetention: boolean;
  noActiveDbReference: boolean;
  ownerAllowlist: boolean;
};

export function evaluateSafeForGc(input: SafeForGcInput): {
  safe: boolean;
  ownerApproved: boolean;
  failed: string[];
} {
  const checks: Array<[keyof SafeForGcInput, boolean]> = [
    ["classification", input.classification === "ORPHAN"],
    ["identityUnambiguous", input.identityUnambiguous],
    ["backupExists", input.backupExists],
    ["manifestExists", input.manifestExists],
    ["sha256Match", input.sha256Match],
    ["restoreVerified", input.restoreVerified],
    ["notLivingUser", input.notLivingUser],
    ["notPlatform", input.notPlatform],
    ["notActiveRetention", input.notActiveRetention],
    ["noActiveDbReference", input.noActiveDbReference],
    ["ownerAllowlist", input.ownerAllowlist],
  ];
  const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);
  return {
    safe: failed.length === 0,
    ownerApproved: input.ownerAllowlist && failed.length === 0,
    failed,
  };
}

export function summarizeInventory(
  rows: Array<{ classification: BackupClassification }>,
): {
  USER: number;
  PLATFORM: number;
  ORPHAN: number;
  UNKNOWN: number;
  TOTAL: number;
  matchesExpected: boolean;
} {
  const summary = { USER: 0, PLATFORM: 0, ORPHAN: 0, UNKNOWN: 0, TOTAL: rows.length };
  for (const row of rows) {
    summary[row.classification] += 1;
  }
  const matchesExpected =
    summary.USER === SA07_EXPECTED_INVENTORY.USER &&
    summary.PLATFORM === SA07_EXPECTED_INVENTORY.PLATFORM &&
    summary.ORPHAN === SA07_EXPECTED_INVENTORY.ORPHAN &&
    summary.TOTAL === SA07_EXPECTED_INVENTORY.TOTAL;
  return { ...summary, matchesExpected };
}

export { sniffAudioContainer } from "@/lib/beats/audio-validation";

export function buildEvidenceDocument(
  manifest: BackupManifestRecord,
): Record<string, unknown> {
  return {
    ...manifest,
    evidence_sha256: sha256Hex(
      Buffer.from(JSON.stringify(manifest), "utf8"),
    ),
  };
}

export function idempotencyKey(params: {
  sourceBucket: string;
  sourceObjectKey: string;
  sourceSha256: string;
}): string {
  return `${params.sourceBucket}\0${params.sourceObjectKey}\0${params.sourceSha256}`;
}

/** VPS Layer-1 root (Phase 2). Production objects must not be written until Phase 4+ GO. */
export const SA07_VPS_BACKUP_ROOT = "/srv/bitrymdym-backup";

export type DryRunAction = "COPY" | "SKIP" | "UPDATE" | "BLOCKED";

export type DryRunPlanRow = {
  object_key: string;
  classification: BackupClassification;
  size_bytes: number;
  content_type: string;
  etag: string | null;
  planned_destination: string | null;
  action: DryRunAction;
  reason: string;
};

/**
 * Fail-closed object-key safety for VPS path mapping.
 * Rejects absolute paths, traversal, NUL/control chars, empty segments.
 */
export function assertSafeSourceObjectKey(objectKey: string): void {
  if (!objectKey || typeof objectKey !== "string") {
    throw new Error("object_key empty");
  }
  if (objectKey.includes("\0")) {
    throw new Error("object_key contains NUL");
  }
  if (/[\u0000-\u001f\u007f]/.test(objectKey)) {
    throw new Error("object_key contains control characters");
  }
  if (objectKey.startsWith("/") || objectKey.startsWith("\\")) {
    throw new Error("object_key must be relative");
  }
  if (objectKey.includes("\\")) {
    throw new Error("object_key must use forward slashes only");
  }
  const parts = objectKey.split("/");
  if (parts.some((p) => p.length === 0)) {
    throw new Error("object_key has empty path segment");
  }
  if (parts.some((p) => p === "." || p === "..")) {
    throw new Error("object_key path traversal rejected");
  }
}

export function mapVpsBackupObjectPath(params: {
  backupRoot?: string;
  bucket: string;
  objectKey: string;
}): string {
  assertSafeSourceObjectKey(params.bucket);
  assertSafeSourceObjectKey(params.objectKey);
  const root = (params.backupRoot ?? SA07_VPS_BACKUP_ROOT).replace(/\/+$/, "");
  if (root.includes("..")) {
    throw new Error("backupRoot invalid");
  }
  return `${root}/objects/${params.bucket}/${params.objectKey}`;
}

/**
 * Metadata-only / fixture dry-run planner.
 * Does not download bytes. SHA comparison only when hashes are supplied.
 */
export function planDryRunAction(params: {
  objectKey: string;
  classification: BackupClassification;
  sizeBytes: number;
  contentType: string;
  etag: string | null;
  sourceSha256: string | null;
  existingDestinationSha256: string | null;
  backupRoot?: string;
  bucket?: string;
}): DryRunPlanRow {
  const bucket = params.bucket ?? SA07_SOURCE_BUCKET;
  let destination: string | null = null;
  try {
    destination = mapVpsBackupObjectPath({
      backupRoot: params.backupRoot,
      bucket,
      objectKey: params.objectKey,
    });
  } catch (err) {
    return {
      object_key: params.objectKey,
      classification: params.classification,
      size_bytes: params.sizeBytes,
      content_type: params.contentType,
      etag: params.etag,
      planned_destination: null,
      action: "BLOCKED",
      reason: err instanceof Error ? err.message : "unsafe path",
    };
  }

  if (!isInBackupScope(params.classification)) {
    return {
      object_key: params.objectKey,
      classification: params.classification,
      size_bytes: params.sizeBytes,
      content_type: params.contentType,
      etag: params.etag,
      planned_destination: destination,
      action: "BLOCKED",
      reason: `classification ${params.classification} out of V1 scope`,
    };
  }

  if (
    params.sourceSha256 &&
    params.existingDestinationSha256 &&
    params.sourceSha256 === params.existingDestinationSha256
  ) {
    return {
      object_key: params.objectKey,
      classification: params.classification,
      size_bytes: params.sizeBytes,
      content_type: params.contentType,
      etag: params.etag,
      planned_destination: destination,
      action: "SKIP",
      reason: "idempotent identity match (bucket+key+sha256)",
    };
  }

  if (
    params.sourceSha256 &&
    params.existingDestinationSha256 &&
    params.sourceSha256 !== params.existingDestinationSha256
  ) {
    return {
      object_key: params.objectKey,
      classification: params.classification,
      size_bytes: params.sizeBytes,
      content_type: params.contentType,
      etag: params.etag,
      planned_destination: destination,
      action: "UPDATE",
      reason: "same key, different sha256 — new generation required (no blind overwrite)",
    };
  }

  return {
    object_key: params.objectKey,
    classification: params.classification,
    size_bytes: params.sizeBytes,
    content_type: params.contentType,
    etag: params.etag,
    planned_destination: destination,
    action: "COPY",
    reason:
      params.existingDestinationSha256 == null
        ? "no verified Layer-1 destination yet (metadata dry-run)"
        : "destination present without source sha — plan COPY at canary",
  };
}

export function summarizeDryRun(
  rows: DryRunPlanRow[],
): Record<DryRunAction, number> & { TOTAL: number } {
  const out = { COPY: 0, SKIP: 0, UPDATE: 0, BLOCKED: 0, TOTAL: rows.length };
  for (const row of rows) {
    out[row.action] += 1;
  }
  return out;
}

/** Atomic write pattern for Layer-1 (fixture / future production). */
export async function atomicWriteFile(params: {
  stagingPath: string;
  finalPath: string;
  bytes: Uint8Array;
  fsync?: (fd: number) => void;
}): Promise<{ sha256: string; bytesWritten: number }> {
  const fs = await import("node:fs/promises");
  const { open, rename, mkdir } = fs;
  const path = await import("node:path");
  await mkdir(path.dirname(params.stagingPath), { recursive: true });
  await mkdir(path.dirname(params.finalPath), { recursive: true });
  const handle = await open(params.stagingPath, "w");
  try {
    await handle.writeFile(params.bytes);
    if (params.fsync) {
      params.fsync(handle.fd);
    } else {
      await handle.sync();
    }
  } finally {
    await handle.close();
  }
  const sha = sha256Hex(params.bytes);
  await rename(params.stagingPath, params.finalPath);
  return { sha256: sha, bytesWritten: params.bytes.byteLength };
}
