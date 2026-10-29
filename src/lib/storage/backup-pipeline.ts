import { randomUUID } from "node:crypto";

import {
  type BackupClassification,
  type BackupManifestRecord,
  type BackupRunMode,
  type SourceObjectMeta,
  buildEvidenceDocument,
  classifyBeatAudioObject,
  gcStatusAfterVerify,
  isInBackupScope,
  mapBackupObjectKey,
  mapEvidenceObjectKey,
  sha256Hex,
  sniffAudioContainer,
  verifyIntegrity,
  SA07_BACKUP_PROVIDER,
  SA07_HASH_ALGORITHM,
  SA07_OBJECT_LOCK_MODE,
  SA07_RETENTION_DAYS_MIN,
  SA07_SOURCE_BUCKET,
  SA07_TOOL_VERSION,
} from "./backup-manifest";

export type { SourceObjectMeta } from "./backup-manifest";

export class BackupToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupToolError";
  }
}

export type StoredObject = {
  key: string;
  versionId: string;
  bytes: Uint8Array;
  contentType: string;
  lockMode: typeof SA07_OBJECT_LOCK_MODE | null;
  retainUntil: string | null;
  etag: string | null;
};

export type BackupObjectStore = {
  putObject(params: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    lockMode: typeof SA07_OBJECT_LOCK_MODE;
    retentionDays: number;
  }): Promise<{ versionId: string }>;
  getObject(params: {
    key: string;
    versionId?: string;
  }): Promise<StoredObject>;
  deleteObject(params: { key: string; versionId?: string }): Promise<void>;
};

export type SourceByteStore = {
  list(): Promise<SourceObjectMeta[]>;
  read(objectKey: string): Promise<Uint8Array>;
};

export type ManifestRepository = {
  findMatch(params: {
    sourceBucket: string;
    sourceObjectKey: string;
    sourceSha256: string;
  }): Promise<BackupManifestRecord | null>;
  insert(record: BackupManifestRecord): Promise<void>;
};

export type MemoryManifestRepository = ManifestRepository & {
  records: BackupManifestRecord[];
};

export function createMemoryManifestRepository(): MemoryManifestRepository {
  const records: BackupManifestRecord[] = [];
  return {
    records,
    async findMatch(params) {
      return (
        records.find(
          (r) =>
            r.source_bucket === params.sourceBucket &&
            r.source_object_key === params.sourceObjectKey &&
            r.source_sha256 === params.sourceSha256 &&
            r.verify_status === "MATCH",
        ) ?? null
      );
    },
    async insert(record) {
      records.push(record);
    },
  };
}

export class ComplianceLockedMemoryStore implements BackupObjectStore {
  readonly objects = new Map<string, StoredObject[]>();

  async putObject(params: {
    key: string;
    bytes: Uint8Array;
    contentType: string;
    lockMode: typeof SA07_OBJECT_LOCK_MODE;
    retentionDays: number;
  }): Promise<{ versionId: string }> {
    if (params.lockMode !== SA07_OBJECT_LOCK_MODE) {
      throw new BackupToolError("Object Lock COMPLIANCE required");
    }
    if (params.retentionDays < SA07_RETENTION_DAYS_MIN) {
      throw new BackupToolError("retention below 90 days");
    }
    const versionId = randomUUID();
    const retainUntil = new Date(
      Date.now() + params.retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const stored: StoredObject = {
      key: params.key,
      versionId,
      bytes: params.bytes,
      contentType: params.contentType,
      lockMode: SA07_OBJECT_LOCK_MODE,
      retainUntil,
      etag: `"${sha256Hex(params.bytes).slice(0, 32)}"`,
    };
    const versions = this.objects.get(params.key) ?? [];
    versions.push(stored);
    this.objects.set(params.key, versions);
    return { versionId };
  }

  async getObject(params: {
    key: string;
    versionId?: string;
  }): Promise<StoredObject> {
    const versions = this.objects.get(params.key) ?? [];
    const found = params.versionId
      ? versions.find((v) => v.versionId === params.versionId)
      : versions[versions.length - 1];
    if (!found) {
      throw new BackupToolError(`object not found: ${params.key}`);
    }
    return found;
  }

  async deleteObject(params: { key: string; versionId?: string }): Promise<void> {
    const versions = this.objects.get(params.key) ?? [];
    const target = params.versionId
      ? versions.find((v) => v.versionId === params.versionId)
      : versions[versions.length - 1];
    if (!target) {
      throw new BackupToolError(`object not found: ${params.key}`);
    }
    if (target.lockMode === SA07_OBJECT_LOCK_MODE && target.retainUntil) {
      if (new Date(target.retainUntil).getTime() > Date.now()) {
        throw new BackupToolError("Object Lock COMPLIANCE: DELETE denied");
      }
    }
    this.objects.set(
      params.key,
      versions.filter((v) => v.versionId !== target.versionId),
    );
  }
}

export type PipelineResult = {
  mode: BackupRunMode;
  backup_run_id: string;
  status: "PASS" | "FAIL" | "ABORTED";
  skipped: number;
  copied: number;
  failed: number;
  manifests: BackupManifestRecord[];
  inventory: Array<{
    objectKey: string;
    classification: BackupClassification;
    dbRefsCount: number;
  }>;
  error?: string;
};

export async function runBackupPipeline(params: {
  mode: BackupRunMode;
  operator: string;
  source: SourceByteStore;
  backup: BackupObjectStore;
  manifests: ManifestRepository;
  backupBucket: string;
  allowDelete?: boolean;
}): Promise<PipelineResult> {
  if (params.allowDelete) {
    throw new BackupToolError("source/backup DELETE is forbidden in this tool");
  }
  const backupRunId = randomUUID();
  const inventory: PipelineResult["inventory"] = [];
  const manifests: BackupManifestRecord[] = [];
  let skipped = 0;
  let copied = 0;
  let failed = 0;

  const listed = await params.source.list();
  for (const meta of listed) {
    if (meta.bucket !== SA07_SOURCE_BUCKET) {
      failed += 1;
      return {
        mode: params.mode,
        backup_run_id: backupRunId,
        status: "FAIL",
        skipped,
        copied,
        failed,
        manifests,
        inventory,
        error: `unexpected source bucket ${meta.bucket}`,
      };
    }
    const classification = classifyBeatAudioObject({
      objectKey: meta.objectKey,
      dbRefsCount: meta.dbRefsCount,
    });
    inventory.push({
      objectKey: meta.objectKey,
      classification,
      dbRefsCount: meta.dbRefsCount,
    });
    if (!isInBackupScope(classification) || params.mode === "dry-run") {
      continue;
    }

    const sourceBytes = await params.source.read(meta.objectKey);
    const sourceSha256 = sha256Hex(sourceBytes);
    const existing = await params.manifests.findMatch({
      sourceBucket: meta.bucket,
      sourceObjectKey: meta.objectKey,
      sourceSha256,
    });
    if (existing) {
      skipped += 1;
      manifests.push(existing);
      continue;
    }

    if (params.mode !== "backup") {
      continue;
    }

    const backupKey = mapBackupObjectKey(meta.objectKey);
    const put = await params.backup.putObject({
      key: backupKey,
      bytes: sourceBytes,
      contentType: meta.contentType,
      lockMode: SA07_OBJECT_LOCK_MODE,
      retentionDays: SA07_RETENTION_DAYS_MIN,
    });
    const stored = await params.backup.getObject({
      key: backupKey,
      versionId: put.versionId,
    });
    const backupSha256 = sha256Hex(stored.bytes);
    const verify = verifyIntegrity({
      sourceSha256,
      backupSha256,
      sourceSize: meta.sizeBytes,
      backupSize: stored.bytes.byteLength,
      sourceKey: meta.objectKey,
      backupMappedKey: backupKey,
    });
    const manifestId = randomUUID();
    const record: BackupManifestRecord = {
      manifest_id: manifestId,
      backup_run_id: backupRunId,
      source_bucket: meta.bucket,
      source_object_key: meta.objectKey,
      source_size_bytes: meta.sizeBytes,
      source_content_type: meta.contentType,
      source_sha256: sourceSha256,
      source_etag: meta.etag,
      source_version_id: meta.versionId,
      source_last_modified: meta.lastModified,
      classification,
      db_refs_count: meta.dbRefsCount,
      backup_provider: SA07_BACKUP_PROVIDER,
      backup_bucket: params.backupBucket,
      backup_object_key: backupKey,
      backup_version_id: put.versionId,
      backup_sha256: backupSha256,
      backup_size_bytes: stored.bytes.byteLength,
      backed_up_at: new Date().toISOString(),
      hash_algorithm: SA07_HASH_ALGORITHM,
      verify_status: verify,
      restore_drill_status: "NOT_RUN",
      restore_drill_at: null,
      gc_safety_status: gcStatusAfterVerify(verify),
      evidence_path: mapEvidenceObjectKey(backupRunId, manifestId),
      operator: params.operator,
      tool_version: SA07_TOOL_VERSION,
    };

    if (verify !== "MATCH") {
      failed += 1;
      manifests.push(record);
      continue;
    }

    const evidence = buildEvidenceDocument(record);
    await params.backup.putObject({
      key: record.evidence_path,
      bytes: Buffer.from(JSON.stringify(evidence), "utf8"),
      contentType: "application/json",
      lockMode: SA07_OBJECT_LOCK_MODE,
      retentionDays: SA07_RETENTION_DAYS_MIN,
    });
    await params.manifests.insert(record);
    manifests.push(record);
    copied += 1;
  }

  return {
    mode: params.mode,
    backup_run_id: backupRunId,
    status: failed === 0 ? "PASS" : "FAIL",
    skipped,
    copied,
    failed,
    manifests,
    inventory,
  };
}

export async function runIsolatedRestoreDrill(params: {
  backup: BackupObjectStore;
  manifest: BackupManifestRecord;
  restoreStore: BackupObjectStore;
}): Promise<{
  restore_drill_status: "PASS" | "FAIL";
  restored_sha256: string;
  size_match: boolean;
  mime_ok: boolean;
  wav_or_audio_smoke: boolean;
}> {
  const stored = await params.backup.getObject({
    key: params.manifest.backup_object_key,
    versionId: params.manifest.backup_version_id,
  });
  const restoredSha = sha256Hex(stored.bytes);
  const sniff = sniffAudioContainer(stored.bytes);
  const sizeMatch = stored.bytes.byteLength === params.manifest.source_size_bytes;
  const mimeOk = stored.contentType === params.manifest.source_content_type;
  const hashOk = restoredSha === params.manifest.source_sha256;
  const isolatedKey = `restore-drill/${params.manifest.backup_run_id}/${params.manifest.source_object_key}`;
  await params.restoreStore.putObject({
    key: isolatedKey,
    bytes: stored.bytes,
    contentType: stored.contentType,
    lockMode: SA07_OBJECT_LOCK_MODE,
    retentionDays: SA07_RETENTION_DAYS_MIN,
  });
  const pass =
    hashOk && sizeMatch && mimeOk && sniff.readable && restoredSha === params.manifest.backup_sha256;
  return {
    restore_drill_status: pass ? "PASS" : "FAIL",
    restored_sha256: restoredSha,
    size_match: sizeMatch,
    mime_ok: mimeOk,
    wav_or_audio_smoke: sniff.readable,
  };
}
