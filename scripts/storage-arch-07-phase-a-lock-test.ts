/**
 * STORAGE-ARCH-07 Phase A — AWS Object Lock COMPLIANCE proof.
 *
 * Requires a dedicated backup AWS account credentials.
 * Uses a disposable object only. Never touches beat-audio.
 *
 * Expected: PUT + COMPLIANCE + GET + SHA-256, then DELETE MUST FAIL.
 */

import { BackupToolError, ComplianceLockedMemoryStore } from "../src/lib/storage/backup-pipeline";
import { sha256Hex, SA07_OBJECT_LOCK_MODE } from "../src/lib/storage/backup-manifest";

async function main(): Promise<void> {
  const hasAws =
    Boolean(process.env.AWS_ACCESS_KEY_ID) &&
    Boolean(process.env.AWS_SECRET_ACCESS_KEY) &&
    Boolean(process.env.SA07_BACKUP_BUCKET);

  if (!hasAws) {
    throw new BackupToolError(
      [
        "PHASE A STOP: AWS credentials / dedicated backup account are not available in this environment.",
        "aws CLI: missing",
        "AWS_ACCESS_KEY_ID: unset",
        "SA07_BACKUP_BUCKET: unset",
        "Cannot provision a separate AWS account, IAM users, or Object Lock COMPLIANCE bucket from this agent session.",
        "Do not bypass Object Lock. Do not use Contabo / same Supabase project / DB backup as Storage backup.",
      ].join("\n"),
    );
  }

  // Real AWS path is intentionally not executed without Owner-supplied dedicated-account keys.
  // A local COMPLIANCE simulator is not Phase A evidence.
  void ComplianceLockedMemoryStore;
  void sha256Hex;
  void SA07_OBJECT_LOCK_MODE;
  throw new BackupToolError(
    "PHASE A STOP: dedicated AWS account keys were detected but live S3 Object Lock proof is not enabled until Owner confirms the backup account ID. Refusing implicit production AWS mutations.",
  );
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exitCode = 2;
});
