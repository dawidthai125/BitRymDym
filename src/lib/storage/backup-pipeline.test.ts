import { describe, expect, it } from "vitest";

import { iamAllowsAction, SA07_BACKUP_READER_POLICY, SA07_BACKUP_WRITER_POLICY } from "./backup-iam-policies";
import { sha256Hex } from "./backup-manifest";
import {
  BackupToolError,
  ComplianceLockedMemoryStore,
  createMemoryManifestRepository,
  runBackupPipeline,
  runIsolatedRestoreDrill,
} from "./backup-pipeline";
import type { SourceByteStore, SourceObjectMeta } from "./backup-pipeline";

function sourceStore(
  objects: Array<{
    key: string;
    bytes: Buffer;
    dbRefsCount: number;
    contentType?: string;
  }>,
): SourceByteStore {
  return {
    async list(): Promise<SourceObjectMeta[]> {
      return objects.map((o) => ({
        bucket: "beat-audio",
        objectKey: o.key,
        sizeBytes: o.bytes.byteLength,
        contentType: o.contentType ?? "audio/wav",
        etag: null,
        versionId: null,
        lastModified: "2026-10-04T00:00:00.000Z",
        dbRefsCount: o.dbRefsCount,
      }));
    },
    async read(objectKey: string) {
      const found = objects.find((o) => o.key === objectKey);
      if (!found) throw new Error("missing");
      return found.bytes;
    },
  };
}

const WAV = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([16, 0, 0, 0]),
  Buffer.from("WAVE"),
  Buffer.from("data"),
]);

describe("STORAGE-ARCH-07 pipeline + lock + IAM", () => {
  it("dry-run lists and classifies without PUT", async () => {
    const backup = new ComplianceLockedMemoryStore();
    const result = await runBackupPipeline({
      mode: "dry-run",
      operator: "test",
      source: sourceStore([
        { key: "user/a/b/c/master.bin", bytes: WAV, dbRefsCount: 1 },
        { key: "platform/b/c/master.bin", bytes: WAV, dbRefsCount: 1 },
        { key: "user/x/y/master/z.bin", bytes: WAV, dbRefsCount: 0 },
      ]),
      backup,
      manifests: createMemoryManifestRepository(),
      backupBucket: "example-beat-audio-backup",
    });
    expect(result.status).toBe("PASS");
    expect(result.copied).toBe(0);
    expect(backup.objects.size).toBe(0);
    expect(result.inventory.map((i) => i.classification)).toEqual([
      "USER",
      "PLATFORM",
      "ORPHAN",
    ]);
  });

  it("backup copies, verifies SHA-256, writes locked evidence", async () => {
    const backup = new ComplianceLockedMemoryStore();
    const manifests = createMemoryManifestRepository();
    const result = await runBackupPipeline({
      mode: "backup",
      operator: "test",
      source: sourceStore([
        { key: "user/a/b/c/master.bin", bytes: WAV, dbRefsCount: 1 },
      ]),
      backup,
      manifests,
      backupBucket: "example-beat-audio-backup",
    });
    expect(result.status).toBe("PASS");
    expect(result.copied).toBe(1);
    const rec = result.manifests[0];
    expect(rec.verify_status).toBe("MATCH");
    expect(rec.gc_safety_status).toBe("BACKED_UP");
    expect(rec.source_sha256).toBe(sha256Hex(WAV));
    expect(rec.backup_sha256).toBe(rec.source_sha256);
    await expect(
      backup.deleteObject({
        key: rec.backup_object_key,
        versionId: rec.backup_version_id,
      }),
    ).rejects.toThrow(/COMPLIANCE/);
  });

  it("checksum flip is MISMATCH / NOT BACKED_UP", async () => {
    const backup = new ComplianceLockedMemoryStore();
    const originalPut = backup.putObject.bind(backup);
    backup.putObject = async (params) => {
      if (params.key.startsWith("beat-audio/")) {
        const flipped = Buffer.from(params.bytes);
        flipped[0] = flipped[0] ^ 0xff;
        return originalPut({ ...params, bytes: flipped });
      }
      return originalPut(params);
    };
    const result = await runBackupPipeline({
      mode: "backup",
      operator: "test",
      source: sourceStore([
        { key: "platform/b/c/master.bin", bytes: WAV, dbRefsCount: 1 },
      ]),
      backup,
      manifests: createMemoryManifestRepository(),
      backupBucket: "example-beat-audio-backup",
    });
    expect(result.status).toBe("FAIL");
    expect(result.manifests[0].verify_status).toBe("MISMATCH");
    expect(result.manifests[0].gc_safety_status).toBe("NOT_SAFE");
  });

  it("is idempotent on MATCH skip", async () => {
    const backup = new ComplianceLockedMemoryStore();
    const manifests = createMemoryManifestRepository();
    const source = sourceStore([
      { key: "user/a/b/c/master.bin", bytes: WAV, dbRefsCount: 1 },
    ]);
    const first = await runBackupPipeline({
      mode: "backup",
      operator: "test",
      source,
      backup,
      manifests,
      backupBucket: "example-beat-audio-backup",
    });
    const second = await runBackupPipeline({
      mode: "backup",
      operator: "test",
      source,
      backup,
      manifests,
      backupBucket: "example-beat-audio-backup",
    });
    expect(first.copied).toBe(1);
    expect(second.copied).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it("refuses delete capability flag", async () => {
    await expect(
      runBackupPipeline({
        mode: "dry-run",
        operator: "test",
        source: sourceStore([]),
        backup: new ComplianceLockedMemoryStore(),
        manifests: createMemoryManifestRepository(),
        backupBucket: "x",
        allowDelete: true,
      }),
    ).rejects.toBeInstanceOf(BackupToolError);
  });

  it("isolated restore drill never writes source keys", async () => {
    const backup = new ComplianceLockedMemoryStore();
    const restore = new ComplianceLockedMemoryStore();
    const manifests = createMemoryManifestRepository();
    const result = await runBackupPipeline({
      mode: "backup",
      operator: "test",
      source: sourceStore([
        { key: "user/orphan/key/master.bin", bytes: WAV, dbRefsCount: 0 },
      ]),
      backup,
      manifests,
      backupBucket: "example-beat-audio-backup",
    });
    const drill = await runIsolatedRestoreDrill({
      backup,
      restoreStore: restore,
      manifest: result.manifests[0],
    });
    expect(drill.restore_drill_status).toBe("PASS");
    expect(restore.objects.has("user/orphan/key/master.bin")).toBe(false);
  });

  it("writer IAM denies DeleteObject", () => {
    expect(iamAllowsAction(SA07_BACKUP_WRITER_POLICY, "s3:PutObject")).toBe(
      true,
    );
    expect(iamAllowsAction(SA07_BACKUP_WRITER_POLICY, "s3:DeleteObject")).toBe(
      false,
    );
    expect(iamAllowsAction(SA07_BACKUP_READER_POLICY, "s3:PutObject")).toBe(
      false,
    );
    expect(iamAllowsAction(SA07_BACKUP_READER_POLICY, "s3:GetObject")).toBe(
      true,
    );
  });
});
