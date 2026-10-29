/**
 * STORAGE-ARCH-07 isolated restore drill CLI.
 * Never restores onto beat-audio source keys.
 * Production restore is refused until Phase A lock evidence exists.
 */

import {
  SA07_DEFAULT_BACKUP_BUCKET,
  sha256Hex,
} from "../src/lib/storage/backup-manifest";
import {
  BackupToolError,
  ComplianceLockedMemoryStore,
  createMemoryManifestRepository,
  runBackupPipeline,
  runIsolatedRestoreDrill,
  type SourceByteStore,
  type SourceObjectMeta,
} from "../src/lib/storage/backup-pipeline";

const WAV = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([16, 0, 0, 0]),
  Buffer.from("WAVE"),
]);

function fixtureSource(): SourceByteStore {
  const object: SourceObjectMeta = {
    bucket: "beat-audio",
    objectKey: "user/fixture/orphan/master.bin",
    sizeBytes: WAV.byteLength,
    contentType: "audio/wav",
    etag: null,
    versionId: null,
    lastModified: new Date().toISOString(),
    dbRefsCount: 0,
  };
  return {
    async list() {
      return [object];
    },
    async read() {
      return WAV;
    },
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--source=prod")) {
    throw new BackupToolError(
      "PRODUCTION RESTORE DRILL REFUSED: AWS Phase A Object Lock COMPLIANCE evidence is absent.",
    );
  }

  const backup = new ComplianceLockedMemoryStore();
  const restore = new ComplianceLockedMemoryStore();
  const manifests = createMemoryManifestRepository();
  const backupResult = await runBackupPipeline({
    mode: "backup",
    operator: process.env.SA07_OPERATOR ?? "local-operator",
    source: fixtureSource(),
    backup,
    manifests,
    backupBucket: process.env.SA07_BACKUP_BUCKET ?? SA07_DEFAULT_BACKUP_BUCKET,
  });
  const drill = await runIsolatedRestoreDrill({
    backup,
    restoreStore: restore,
    manifest: backupResult.manifests[0],
  });
  console.log(
    JSON.stringify(
      {
        tool: "storage-arch-07-restore-drill",
        restore_drill_status: drill.restore_drill_status,
        restored_sha256: drill.restored_sha256,
        source_sha256: backupResult.manifests[0]?.source_sha256,
        hashes_equal:
          drill.restored_sha256 === backupResult.manifests[0]?.source_sha256,
        wav_or_audio_smoke: drill.wav_or_audio_smoke,
        isolated: true,
        wrote_source_key: false,
        sourceDelete: "NONE",
        arch05: "BLOCKED",
        fixture_sha256: sha256Hex(WAV),
      },
      null,
      2,
    ),
  );
  if (drill.restore_drill_status !== "PASS") process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 2;
});
