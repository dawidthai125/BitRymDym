/**
 * FAR-01 Backfill operator entry — DRY-RUN ONLY by default.
 *
 * Implementation GO: YES (this tooling).
 * Backfill GO: NO — refuses LIVE / remote mutation in this script.
 *
 * Usage:
 *   npx tsx scripts/far01-backfill-dry-run.ts
 *
 * Does not connect to Production Storage/DB.
 * Prints a sample dry-run against in-memory fixtures to prove wiring.
 */

import {
  FAR01_DEFAULT_AUTHORIZATION,
  runFar01BackfillBatch,
  type Far01BackfillCandidate,
} from "../src/lib/beats/far01-backfill";
import {
  buildLegacyUserBeatMasterObjectKey,
} from "../src/lib/beats/audio-validation";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const ANOMALY_ASSET = "000d406d-265e-4e49-bd3f-a542d5dd0b41";
const PATH_UUID = "ef9e21dc-d941-4608-b26e-ee4ea417ad63";

function fixtureCandidates(): Far01BackfillCandidate[] {
  const okKey = buildLegacyUserBeatMasterObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId: ASSET,
  });
  const anomalyKey = `user/${OWNER}/${BEAT}/master/${PATH_UUID}.bin`;
  return [
    {
      asset: {
        id: ASSET,
        beat_id: BEAT,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: okKey,
        content_type: "audio/mpeg",
        byte_size: 1000,
        checksum_sha256: null,
        is_active: true,
        replaced_by_asset_id: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      beat: {
        id: BEAT,
        owner_id: OWNER,
        ownership_type: "USER",
        status: "PUBLISHED",
      },
      sourceMeta: { exists: true, size: 1000, contentType: "audio/mpeg" },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    },
    {
      asset: {
        id: ANOMALY_ASSET,
        beat_id: BEAT,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: anomalyKey,
        content_type: "audio/mpeg",
        byte_size: 2000,
        checksum_sha256: null,
        is_active: true,
        replaced_by_asset_id: null,
        created_at: "2026-01-02T00:00:00.000Z",
      },
      beat: {
        id: BEAT,
        owner_id: OWNER,
        ownership_type: "USER",
        status: "PUBLISHED",
      },
      sourceMeta: { exists: true, size: 2000, contentType: "audio/mpeg" },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    },
  ];
}

async function main(): Promise<void> {
  const liveRequested =
    process.argv.includes("--live") ||
    process.env.FAR01_BACKFILL_MODE === "LIVE";

  if (liveRequested) {
    console.error(
      JSON.stringify({
        error: "LIVE_REFUSED",
        message:
          "scripts/far01-backfill-dry-run.ts refuses LIVE. OD-BF-08 BACKFILL GO = NO.",
        backfillGo: false,
        retirementGo: false,
      }),
    );
    process.exit(2);
  }

  const summary = await runFar01BackfillBatch(fixtureCandidates(), {
    mode: "DRY_RUN",
    authorization: FAR01_DEFAULT_AUTHORIZATION,
  });

  console.log(
    JSON.stringify(
      {
        notice:
          "FAR-01 backfill dry-run against in-memory fixtures only. No remote DB/Storage mutation.",
        implementationGo: true,
        backfillGo: false,
        retirementGo: false,
        live_mutations_attempted: summary.live_mutations_attempted,
        summary: {
          batch_id: summary.batch_id,
          mode: summary.mode,
          total: summary.total,
          migrate: summary.migrate,
          skip: summary.skip,
          quarantine: summary.quarantine,
          fail: summary.fail,
          owner_review: summary.owner_review,
        },
        assets: summary.assets.map((a) => ({
          asset_id: a.asset_id,
          action: a.action,
          status: a.status,
          checksum_status: a.checksum_status,
          content_identity: a.content_identity,
          DB_update_status: a.DB_update_status,
          failure_reason: a.failure_reason,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
