/**
 * STORAGE-ARCH-07 backup operator CLI.
 *
 * Default: dry-run against in-memory fixtures (no Production PUT/DELETE).
 *
 * Production LIST dry-run:
 *   npx tsx scripts/storage-arch-07-backup.ts --mode=dry-run --source=prod
 *
 * Production COPY is refused until AWS Object Lock COMPLIANCE Phase A evidence exists.
 * This tool never deletes beat-audio objects.
 */

import {
  SA07_DEFAULT_BACKUP_BUCKET,
  SA07_EXPECTED_INVENTORY,
  summarizeInventory,
} from "../src/lib/storage/backup-manifest";
import {
  BackupToolError,
  ComplianceLockedMemoryStore,
  createMemoryManifestRepository,
  runBackupPipeline,
  type SourceByteStore,
  type SourceObjectMeta,
} from "../src/lib/storage/backup-pipeline";

const WAV = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([16, 0, 0, 0]),
  Buffer.from("WAVE"),
]);

function fixtureSource(): SourceByteStore {
  const objects: SourceObjectMeta[] = [
    {
      bucket: "beat-audio",
      objectKey: "user/fixture/user/master.bin",
      sizeBytes: WAV.byteLength,
      contentType: "audio/wav",
      etag: null,
      versionId: null,
      lastModified: new Date().toISOString(),
      dbRefsCount: 1,
    },
    {
      bucket: "beat-audio",
      objectKey: "platform/fixture/platform/master.bin",
      sizeBytes: WAV.byteLength,
      contentType: "audio/wav",
      etag: null,
      versionId: null,
      lastModified: new Date().toISOString(),
      dbRefsCount: 1,
    },
    {
      bucket: "beat-audio",
      objectKey: "user/fixture/orphan/master.bin",
      sizeBytes: WAV.byteLength,
      contentType: "audio/wav",
      etag: null,
      versionId: null,
      lastModified: new Date().toISOString(),
      dbRefsCount: 0,
    },
  ];
  return {
    async list() {
      return objects;
    },
    async read() {
      return WAV;
    },
  };
}

function parseMode(argv: string[]): "dry-run" | "backup" {
  const raw = argv.find((a) => a.startsWith("--mode="))?.slice("--mode=".length);
  if (!raw || raw === "dry-run") return "dry-run";
  if (raw === "backup") return "backup";
  throw new BackupToolError(`unsupported mode: ${raw}`);
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv.slice(2));
  const sourceArg =
    process.argv.find((a) => a.startsWith("--source="))?.slice("--source=".length) ??
    "fixture";

  if (sourceArg === "prod" && mode === "backup") {
    throw new BackupToolError(
      "PRODUCTION COPY REFUSED: AWS Phase A Object Lock COMPLIANCE evidence is absent. ARCH-05 DELETE remains BLOCKED.",
    );
  }
  if (sourceArg === "prod" && mode === "dry-run") {
    throw new BackupToolError(
      "PRODUCTION DRY-RUN via this CLI requires operator Supabase env + AWS lock proof. Use SQL inventory classify (read-only) or supply SA07_PHASE_A_LOCK_PASS=1 after Phase A. Refusing implicit prod LIST from this session.",
    );
  }

  const result = await runBackupPipeline({
    mode,
    operator: process.env.SA07_OPERATOR ?? "local-operator",
    source: fixtureSource(),
    backup: new ComplianceLockedMemoryStore(),
    manifests: createMemoryManifestRepository(),
    backupBucket: process.env.SA07_BACKUP_BUCKET ?? SA07_DEFAULT_BACKUP_BUCKET,
  });

  const summary = summarizeInventory(result.inventory);
  console.log(
    JSON.stringify(
      {
        tool: "storage-arch-07-backup",
        mode: result.mode,
        status: result.status,
        copied: result.copied,
        skipped: result.skipped,
        inventory: summary,
        expected: SA07_EXPECTED_INVENTORY,
        sourceDelete: "NONE",
        arch05: "BLOCKED",
      },
      null,
      2,
    ),
  );
  if (result.status !== "PASS") process.exitCode = 1;
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 2;
});
