/**
 * STORAGE-ARCH-07 Phase 3 — metadata dry-run planner (no production byte COPY).
 *
 * Usage:
 *   npx tsx scripts/storage-arch-07-phase3-dry-run.ts --inventory=path.json
 *
 * Inventory JSON: array of {
 *   bucket, object_key, size_bytes, content_type, etag?, db_refs
 * }
 *
 * Never downloads Storage payloads. Never writes /srv/bitrymdym-backup/objects.
 */

import { readFileSync } from "node:fs";

import {
  SA07_EXPECTED_INVENTORY,
  SA07_SOURCE_BUCKET,
  classifyBeatAudioObject,
  planDryRunAction,
  summarizeDryRun,
  summarizeInventory,
  type DryRunPlanRow,
} from "../src/lib/storage/backup-manifest";

type InventoryRow = {
  bucket?: string;
  object_key: string;
  size_bytes: number;
  content_type?: string;
  etag?: string | null;
  db_refs: number;
};

function loadInventory(argv: string[]): InventoryRow[] {
  const arg = argv.find((a) => a.startsWith("--inventory="));
  if (!arg) {
    throw new Error("required: --inventory=<json-file>");
  }
  const path = arg.slice("--inventory=".length);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!Array.isArray(raw)) {
    throw new Error("inventory must be a JSON array");
  }
  return raw as InventoryRow[];
}

function main(): void {
  const rows = loadInventory(process.argv.slice(2));
  const plans: DryRunPlanRow[] = [];
  const classifications: Array<{ classification: ReturnType<typeof classifyBeatAudioObject> }> =
    [];

  for (const row of rows) {
    const bucket = row.bucket ?? SA07_SOURCE_BUCKET;
    if (bucket !== SA07_SOURCE_BUCKET) {
      plans.push({
        object_key: row.object_key,
        classification: "UNKNOWN",
        size_bytes: row.size_bytes,
        content_type: row.content_type ?? "application/octet-stream",
        etag: row.etag ?? null,
        planned_destination: null,
        action: "BLOCKED",
        reason: `unexpected bucket ${bucket}`,
      });
      classifications.push({ classification: "UNKNOWN" });
      continue;
    }
    const classification = classifyBeatAudioObject({
      objectKey: row.object_key,
      dbRefsCount: row.db_refs,
    });
    classifications.push({ classification });
    plans.push(
      planDryRunAction({
        bucket,
        objectKey: row.object_key,
        classification,
        sizeBytes: row.size_bytes,
        contentType: row.content_type ?? "application/octet-stream",
        etag: row.etag ?? null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }),
    );
  }

  const inventory = summarizeInventory(classifications);
  const actions = summarizeDryRun(plans);

  console.log(
    JSON.stringify(
      {
        tool: "storage-arch-07-phase3-dry-run",
        phase: 3,
        production_byte_copy: "NONE",
        vps_objects_written: 0,
        inventory,
        expected: SA07_EXPECTED_INVENTORY,
        matches_expected: inventory.matchesExpected,
        actions,
        sample: plans.slice(0, 5),
        note: "PROPOSED plan only — not BACKED UP / not RESTORE VERIFIED / not SAFE",
        arch05: "NOT READY",
      },
      null,
      2,
    ),
  );

  if (!inventory.matchesExpected || actions.BLOCKED > 0) {
    process.exitCode = 1;
  }
}

main();
