import { describe, expect, it } from "vitest";

import {
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";
import { rejectClientChosenStorageParams } from "@/lib/beats/user-audio-authz";

import {
  assertLiveExecutionAuthorized,
  assertNoClientObjectKeyAuthority,
  buildOptimisticLockUpdateSql,
  evaluateDbUpdateGate,
  evaluatePostCopyIntegrity,
  FAR01_DEFAULT_AUTHORIZATION,
  Far01BackfillAuthorizationError,
  mapFar01BackfillAsset,
  planFar01Rollback,
  resolveExecutionMode,
  runFar01BackfillBatch,
  runFar01Preflight,
  sortAssetsForBatch,
  type Far01AssetSnapshot,
  type Far01BeatSnapshot,
  type Far01BackfillCandidate,
} from "@/lib/beats/far01-backfill";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_BEAT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHER_ASSET = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function asset(
  overrides: Partial<Far01AssetSnapshot> & { object_key: string },
): Far01AssetSnapshot {
  return {
    id: ASSET,
    beat_id: BEAT,
    purpose: "MASTER",
    status: "READY",
    storage_bucket: "beat-audio",
    content_type: "audio/mpeg",
    byte_size: 1000,
    checksum_sha256: null,
    is_active: true,
    replaced_by_asset_id: null,
    ...overrides,
  };
}

function beat(
  overrides: Partial<Far01BeatSnapshot> = {},
): Far01BeatSnapshot {
  return {
    id: BEAT,
    owner_id: OWNER,
    ownership_type: "USER",
    status: "PUBLISHED",
    ...overrides,
  };
}

function legacyKey(
  owner = OWNER,
  beatId = BEAT,
  assetId = ASSET,
): string {
  return buildLegacyUserBeatMasterObjectKey({
    ownerId: owner,
    beatId,
    assetId,
  });
}

function candidate(
  partial?: Partial<Far01BackfillCandidate> & {
    asset?: Far01AssetSnapshot;
    beat?: Far01BeatSnapshot;
  },
): Far01BackfillCandidate {
  const a =
    partial?.asset ??
    asset({ object_key: legacyKey() });
  const b = partial?.beat ?? beat();
  return {
    asset: a,
    beat: b,
    sourceMeta: partial?.sourceMeta ?? {
      exists: true,
      size: a.byte_size,
      contentType: a.content_type,
    },
    destinationMeta: partial?.destinationMeta ?? {
      exists: false,
      size: null,
      contentType: null,
    },
    destinationClaimedByOtherAssetId:
      partial?.destinationClaimedByOtherAssetId ?? null,
    retryCount: partial?.retryCount ?? 0,
  };
}

describe("FAR-01 backfill implementation contracts", () => {
  it("maps destination from DB identities via WRITE SSOT", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey() }),
      beat: beat(),
    });
    expect(mapped.destinationKey).toBe(
      buildUserBeatAudioObjectKey({
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
        purpose: "MASTER",
      }),
    );
    expect(mapped.sourceKey).toBe(legacyKey());
  });

  it("identity mismatch → QUARANTINE · no automatic repair", () => {
    const mismatched = asset({
      id: ASSET,
      object_key: legacyKey(OWNER, BEAT, OTHER_ASSET),
    });
    const mapped = mapFar01BackfillAsset({
      asset: mismatched,
      beat: beat(),
    });
    expect(mapped.identityMismatch).toBe(true);
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.action).toBe("QUARANTINE");
    expect(pf.reason).toBe("identity_mismatch");
    const gate = evaluateDbUpdateGate({
      mapped,
      preflight: pf,
      postCopyAllowDbUpdate: true,
      postCopyReason: "n/a",
    });
    expect(gate.allow).toBe(false);
    expect(gate.reason).toContain("quarantine");
  });

  it("checksum NULL → UNKNOWN (never PASS)", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey(), checksum_sha256: null }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.checksumStatus).toBe("UNKNOWN");
    expect(pf.action).toBe("MIGRATE");
    expect(pf.classification).toBe("UNKNOWN");

    const integrity = evaluatePostCopyIntegrity({
      sourceExists: true,
      destinationExists: true,
      sourceSize: 1000,
      destinationSize: 1000,
      sourceChecksum: null,
      destinationChecksum: null,
      identityMismatch: false,
    });
    expect(integrity.checksumStatus).toBe("UNKNOWN");
    expect(integrity.status).toBe("UNKNOWN");
    expect(integrity.allowDbUpdate).toBe(true);
  });

  it("size mismatch → FAIL · no DB update", () => {
    const integrity = evaluatePostCopyIntegrity({
      sourceExists: true,
      destinationExists: true,
      sourceSize: 1000,
      destinationSize: 999,
      sourceChecksum: null,
      destinationChecksum: null,
      identityMismatch: false,
    });
    expect(integrity.status).toBe("FAIL");
    expect(integrity.allowDbUpdate).toBe(false);
  });

  it("destination exists with different size → conflict · no overwrite", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey() }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: null },
      destinationMeta: { exists: true, size: 500, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.action).toBe("FAIL");
    expect(pf.reason).toBe("destination_exists_conflict");
  });

  it("source missing → FAIL", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey() }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: false, size: null, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.action).toBe("FAIL");
    expect(pf.reason).toBe("missing_storage");
  });

  it("wrong owner / beat / asset → QUARANTINE", () => {
    const cases = [
      {
        key: legacyKey(OTHER, BEAT, ASSET),
        reason: "identity_mismatch",
      },
      {
        key: legacyKey(OWNER, OTHER_BEAT, ASSET),
        reason: "identity_mismatch",
      },
      {
        key: legacyKey(OWNER, BEAT, OTHER_ASSET),
        reason: "identity_mismatch",
      },
    ];
    for (const c of cases) {
      const mapped = mapFar01BackfillAsset({
        asset: asset({ object_key: c.key }),
        beat: beat(),
      });
      const pf = runFar01Preflight({
        mapped,
        sourceMeta: { exists: true, size: 1000, contentType: null },
        destinationMeta: { exists: false, size: null, contentType: null },
        destinationClaimedByOtherAssetId: null,
      });
      expect(pf.action).toBe("QUARANTINE");
      expect(pf.identityMismatch).toBe(true);
    }
  });

  it("wrong bucket / purpose → FAIL", () => {
    const bucketMapped = mapFar01BackfillAsset({
      asset: asset({
        object_key: legacyKey(),
        storage_bucket: "audio-artifacts",
      }),
      beat: beat(),
    });
    expect(
      runFar01Preflight({
        mapped: bucketMapped,
        sourceMeta: { exists: true, size: 1, contentType: null },
        destinationMeta: { exists: false, size: null, contentType: null },
        destinationClaimedByOtherAssetId: null,
      }).reason,
    ).toBe("wrong_bucket");

    const purposeMapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey(), purpose: "PREVIEW" }),
      beat: beat(),
    });
    expect(
      runFar01Preflight({
        mapped: purposeMapped,
        sourceMeta: { exists: true, size: 1, contentType: null },
        destinationMeta: { exists: false, size: null, contentType: null },
        destinationClaimedByOtherAssetId: null,
      }).reason,
    ).toBe("wrong_purpose");
  });

  it("malformed / traversal key → FAIL", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({
        object_key: `user/${OWNER}/../${BEAT}/master/${ASSET}.bin`,
      }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.action).toBe("FAIL");
    expect(pf.reason).toBe("malformed_or_traversal_key");
  });

  it("rejects client object_key authority", () => {
    expect(() =>
      assertNoClientObjectKeyAuthority({ clientObjectKey: "evil/path" }),
    ).toThrow(/Client must not supply/);
    expect(() =>
      rejectClientChosenStorageParams({ objectKey: "evil" }),
    ).toThrow();
  });

  it("unsupported asset status → OWNER_REVIEW (C-02)", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey(), status: "PENDING" }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.action).toBe("OWNER_REVIEW");
    expect(pf.reason).toBe("unsupported_asset_status");
  });

  it("LIVE blocked by default (Backfill GO = NO)", () => {
    expect(() => assertLiveExecutionAuthorized()).toThrow(
      Far01BackfillAuthorizationError,
    );
    expect(() =>
      resolveExecutionMode({
        requested: "LIVE",
        authorization: FAR01_DEFAULT_AUTHORIZATION,
      }),
    ).toThrow(/verified signed GO|BACKFILL GO|boolean is not sufficient/);
  });

  it("dry-run mutates nothing and emits required telemetry", async () => {
    let copyCalls = 0;
    let updateCalls = 0;
    const summary = await runFar01BackfillBatch([candidate()], {
      mode: "DRY_RUN",
      authorization: FAR01_DEFAULT_AUTHORIZATION,
      storageMutator: {
        async copyObject() {
          copyCalls += 1;
        },
      },
      dbMutator: {
        async updateObjectKeyOptimistic() {
          updateCalls += 1;
          return { rowsAffected: 1 };
        },
      },
    });
    expect(summary.mode).toBe("DRY_RUN");
    expect(summary.live_mutations_attempted).toBe(0);
    expect(copyCalls).toBe(0);
    expect(updateCalls).toBe(0);
    expect(summary.assets).toHaveLength(1);
    const row = summary.assets[0]!;
    expect(row.batch_id).toBeTruthy();
    expect(row.asset_id).toBe(ASSET);
    expect(row.source_key).toBeTruthy();
    expect(row.destination_key).toBeTruthy();
    expect(row.started_at).toBeTruthy();
    expect(row.finished_at).toBeTruthy();
    expect(row.status).toBe("UNKNOWN");
    expect(row.checksum_status).toBe("UNKNOWN");
    expect(row.content_identity).toBe("UNKNOWN");
    expect(row.DB_update_status).toBe("SKIPPED");
    expect(row.retry_count).toBe(0);
    expect(row.action).toBe("MIGRATE");
  });

  it("canary limit gates fleet (OD-BF-07)", async () => {
    const assetId1 = "11111111-1111-1111-1111-111111111111";
    const assetId2 = "22222222-2222-2222-2222-222222222222";
    const c1 = candidate({
      asset: {
        ...asset({
          id: assetId1,
          object_key: legacyKey(OWNER, BEAT, assetId1),
        }),
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });
    const c2 = candidate({
      asset: {
        ...asset({
          id: assetId2,
          object_key: legacyKey(OWNER, BEAT, assetId2),
        }),
        created_at: "2026-01-02T00:00:00.000Z",
      },
    });
    const summary = await runFar01BackfillBatch([c1, c2], {
      mode: "DRY_RUN",
      canaryLimit: 1,
    });
    expect(summary.assets.filter((a) => a.action === "MIGRATE")).toHaveLength(
      1,
    );
    expect(summary.assets.filter((a) => a.action === "SKIP")).toHaveLength(1);
  });

  it("deterministic ordering / resume sort", () => {
    const sorted = sortAssetsForBatch([
      { id: "b", created_at: "2026-01-02T00:00:00.000Z" },
      { id: "a", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "c", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(sorted.map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("idempotent already-canonical → SKIP", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({
        object_key: buildUserBeatAudioObjectKey({
          ownerId: OWNER,
          beatId: BEAT,
          assetId: ASSET,
          purpose: "MASTER",
        }),
      }),
      beat: beat(),
    });
    expect(mapped.alreadyCanonical).toBe(true);
    expect(
      runFar01Preflight({
        mapped,
        sourceMeta: { exists: true, size: 1, contentType: null },
        destinationMeta: { exists: true, size: 1, contentType: null },
        destinationClaimedByOtherAssetId: null,
      }).action,
    ).toBe("SKIP");
  });

  it("optimistic lock SQL uses source key predicate", () => {
    const sql = buildOptimisticLockUpdateSql();
    expect(sql).toContain("object_key = $3");
    expect(sql).toContain("WHERE id = $2");
  });

  it("rollback plan retains source · no retirement", () => {
    const plan = planFar01Rollback({
      assetId: ASSET,
      legacyObjectKey: legacyKey(),
      currentObjectKey: buildUserBeatAudioObjectKey({
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
        purpose: "MASTER",
      }),
      legacySourceExists: true,
    });
    expect(plan.canRevert).toBe(true);
    expect(plan.source_must_exist).toBe(true);
  });

  it("LIVE without verified grant fails closed (boolean insufficient)", async () => {
    await expect(
      runFar01BackfillBatch([candidate()], {
        mode: "LIVE",
        authorization: {
          backfillGo: true,
          operatorApproval: true,
          operatorId: "op-test",
        },
        canaryLimit: 1,
      }),
    ).rejects.toThrow(/boolean is not sufficient|verified signed GO/);
  });

  it("retry_count is recorded in telemetry", async () => {
    const summary = await runFar01BackfillBatch(
      [candidate({ retryCount: 3 })],
      { mode: "DRY_RUN" },
    );
    expect(summary.assets[0]!.retry_count).toBe(3);
  });

  it("duplicate destination claim → QUARANTINE", () => {
    const mapped = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey() }),
      beat: beat(),
    });
    const pf = runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: null },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: OTHER_ASSET,
    });
    expect(pf.action).toBe("QUARANTINE");
    expect(pf.reason).toBe("duplicate_destination");
  });
});
