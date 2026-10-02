import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";

import {
  assertFleetPhaseAllowed,
  assertLiveExecutionAuthorized,
  assertNoClientObjectKeyAuthority,
  buildCanaryResult,
  FAR01_DEFAULT_AUTHORIZATION,
  FAR01_OWNER_CANARY_N,
  Far01BackfillAuthorizationError,
  Far01CanaryGateError,
  Far01MutationGateError,
  loadFar01BackfillCandidates,
  mapFar01BackfillAsset,
  postCopyReHeadVerify,
  preMutationHeadCheck,
  runFar01BackfillBatch,
  runFar01Preflight,
  selectCanaryAssetIds,
  serializeFar01GoArtifactPayload,
  signFar01GoArtifact,
  validateCanaryLimit,
  verifyFar01SignedGoArtifact,
  type Far01AssetSnapshot,
  type Far01BackfillCandidate,
  type Far01BeatSnapshot,
  type Far01SignedGoArtifact,
  type Far01StorageInspector,
  type Far01StorageMutator,
  type Far01DbMutator,
} from "@/lib/beats/far01-backfill";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const SCOPE = "far01-user-master-backfill";
const ISSUER = "owner-test-issuer";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

function toCorruptSignature(sig: string): string {
  // Flip first base64url char to a different valid alphabet char.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const first = sig[0] ?? "A";
  const flipped = alphabet[(alphabet.indexOf(first) + 3) % alphabet.length]!;
  return `${flipped}${sig.slice(1)}`;
}

function legacyKey(assetId = ASSET): string {
  return buildLegacyUserBeatMasterObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId,
  });
}

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

function beat(): Far01BeatSnapshot {
  return {
    id: BEAT,
    owner_id: OWNER,
    ownership_type: "USER",
    status: "PUBLISHED",
  };
}

function candidate(
  partial?: Partial<Far01BackfillCandidate>,
): Far01BackfillCandidate {
  const a = partial?.asset ?? asset({ object_key: legacyKey() });
  return {
    asset: a,
    beat: partial?.beat ?? beat(),
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

function signedArtifact(
  overrides: Partial<Omit<Far01SignedGoArtifact, "signature">> = {},
): Far01SignedGoArtifact {
  return signFar01GoArtifact({
    privateKey,
    payload: {
      go: true,
      batch_scope: SCOPE,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      canary_n: FAR01_OWNER_CANARY_N,
      issuer: ISSUER,
      ...overrides,
    },
  });
}

function verifiedGrant(
  overrides: Partial<Omit<Far01SignedGoArtifact, "signature">> = {},
) {
  return verifyFar01SignedGoArtifact(signedArtifact(overrides), {
    publicKey,
    expectedBatchScope: SCOPE,
    allowedIssuers: [ISSUER],
  });
}

describe("B-02 OD-ATT-01 A2 signed GO attestation", () => {
  it("accepts valid signature", () => {
    const grant = verifiedGrant();
    expect(grant.go).toBe(true);
    expect(grant.canaryN).toBe(5);
    expect(grant.batchScope).toBe(SCOPE);
  });

  it("canonical serialization is stable", () => {
    const a = serializeFar01GoArtifactPayload({
      go: true,
      batch_scope: "s",
      expires_at: "t",
      canary_n: 5,
      issuer: "i",
    });
    expect(a).toBe(
      '{"go":true,"batch_scope":"s","expires_at":"t","canary_n":5,"issuer":"i"}',
    );
  });

  it("invalid signature → DENY", () => {
    const art = signedArtifact();
    art.signature = toCorruptSignature(art.signature);
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
      }),
    ).toThrow(/invalid signature/);
  });

  it("expired artifact → DENY", () => {
    const art = signedArtifact({
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
      }),
    ).toThrow(/expired/);
  });

  it("wrong scope → DENY", () => {
    expect(() =>
      verifyFar01SignedGoArtifact(signedArtifact(), {
        publicKey,
        expectedBatchScope: "other-scope",
        allowedIssuers: [ISSUER],
      }),
    ).toThrow(/wrong batch_scope/);
  });

  it("wrong issuer → DENY", () => {
    expect(() =>
      verifyFar01SignedGoArtifact(signedArtifact(), {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: ["not-this-issuer"],
      }),
    ).toThrow(/invalid issuer/);
  });

  it("missing artifact → DENY", () => {
    expect(() =>
      verifyFar01SignedGoArtifact(null, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
      }),
    ).toThrow(/missing signed GO artifact/);
  });

  it("forged boolean alone → DENY", () => {
    expect(() =>
      assertLiveExecutionAuthorized({
        backfillGo: true,
        operatorApproval: true,
      }),
    ).toThrow(/boolean is not sufficient|verified signed GO/);
  });

  it("default deny without grant", () => {
    expect(() => assertLiveExecutionAuthorized()).toThrow(
      Far01BackfillAuthorizationError,
    );
  });

  it("LIVE batch rejects boolean forge even with mutators", async () => {
    await expect(
      runFar01BackfillBatch([candidate()], {
        mode: "LIVE",
        authorization: {
          backfillGo: true,
          operatorApproval: true,
        },
        canaryLimit: 1,
        storageMutator: {
          async copyObject() {},
        },
        dbMutator: {
          async updateObjectKeyOptimistic() {
            return { rowsAffected: 1 };
          },
        },
        storageInspector: {
          async headObject() {
            return { exists: true, size: 1000, contentType: null };
          },
        },
      }),
    ).rejects.toThrow(/boolean is not sufficient|verified signed GO/);
  });
});

describe("B-05 OD-CANARY-N mandatory canary", () => {
  it("N=5 default constant", () => {
    expect(FAR01_OWNER_CANARY_N).toBe(5);
  });

  it("null / undefined / 0 / negative / non-integer / NaN / >inventory DENY", () => {
    expect(() => validateCanaryLimit(null, 10)).toThrow(Far01CanaryGateError);
    expect(() => validateCanaryLimit(undefined, 10)).toThrow(
      Far01CanaryGateError,
    );
    expect(() => validateCanaryLimit(0, 10)).toThrow(/N < 1/);
    expect(() => validateCanaryLimit(-1, 10)).toThrow(/N < 1/);
    expect(() => validateCanaryLimit(1.5, 10)).toThrow(/non-integer/);
    expect(() => validateCanaryLimit(Number.NaN, 10)).toThrow(/NaN/);
    expect(() => validateCanaryLimit(11, 10)).toThrow(/> eligible inventory/);
  });

  it("deterministic ordering + quarantine exclusion", () => {
    const ids = selectCanaryAssetIds({
      canaryLimit: 2,
      rows: [
        { id: "b", created_at: "2026-01-02T00:00:00.000Z", action: "MIGRATE" },
        { id: "a", created_at: "2026-01-01T00:00:00.000Z", action: "MIGRATE" },
        {
          id: "q",
          created_at: "2026-01-01T00:00:00.000Z",
          action: "QUARANTINE",
        },
        { id: "c", created_at: "2026-01-01T00:00:00.000Z", action: "MIGRATE" },
      ],
    });
    expect(ids).toEqual(["a", "c"]);
  });

  it("FLEET without verified canary → DENY", () => {
    expect(() =>
      assertFleetPhaseAllowed({ phase: "FLEET", verifiedCanary: null }),
    ).toThrow(/missing verified canary/);
  });

  it("FLEET requires VERIFY then APPROVAL", () => {
    const pending = buildCanaryResult({
      batchId: "b1",
      selectedAssetIds: ["a"],
      verificationResult: "PENDING",
    });
    expect(() =>
      assertFleetPhaseAllowed({ phase: "FLEET", verifiedCanary: pending }),
    ).toThrow(/not VERIFIED/);

    const verified = buildCanaryResult({
      batchId: "b1",
      selectedAssetIds: ["a"],
      verificationResult: "VERIFIED",
      approved: false,
    });
    expect(() =>
      assertFleetPhaseAllowed({ phase: "FLEET", verifiedCanary: verified }),
    ).toThrow(/not APPROVED/);

    const approved = buildCanaryResult({
      batchId: "b1",
      selectedAssetIds: ["a"],
      verificationResult: "VERIFIED",
      approved: true,
    });
    expect(() =>
      assertFleetPhaseAllowed({ phase: "FLEET", verifiedCanary: approved }),
    ).not.toThrow();
  });

  it("LIVE requires canaryLimit (null DENY)", async () => {
    await expect(
      runFar01BackfillBatch([candidate()], {
        mode: "LIVE",
        verifiedGrant: verifiedGrant({ canary_n: 1 }),
        authorization: {
          backfillGo: false,
          operatorApproval: true,
        },
        canaryLimit: null,
        storageMutator: { async copyObject() {} },
        dbMutator: {
          async updateObjectKeyOptimistic() {
            return { rowsAffected: 1 };
          },
        },
        storageInspector: {
          async headObject({ key }) {
            if (key.includes("/master.bin")) {
              return { exists: false, size: null, contentType: null };
            }
            return { exists: true, size: 1000, contentType: null };
          },
        },
      }),
    ).rejects.toThrow(/canaryLimit|null|unlimited/);
  });
});

describe("B-03 mutator + mandatory re-HEAD", () => {
  it("preflight/mutation separation: DRY_RUN never calls copy", async () => {
    let copies = 0;
    await runFar01BackfillBatch([candidate()], {
      mode: "DRY_RUN",
      storageMutator: {
        async copyObject() {
          copies += 1;
        },
      },
    });
    expect(copies).toBe(0);
  });

  it("upsert false + re-HEAD success path uses headed sizes", async () => {
    const heads: string[] = [];
    const ops: string[] = [];
    const inspector: Far01StorageInspector = {
      async headObject({ key }) {
        heads.push(key);
        if (key.endsWith("/master.bin")) {
          // after copy exists
          const afterCopy = ops.includes("copy");
          return afterCopy
            ? { exists: true, size: 1000, contentType: "audio/mpeg" }
            : { exists: false, size: null, contentType: null };
        }
        return { exists: true, size: 1000, contentType: "audio/mpeg" };
      },
    };
    const storage: Far01StorageMutator = {
      async copyObject(p) {
        expect(p.upsert).toBe(false);
        ops.push("copy");
      },
    };
    const db: Far01DbMutator = {
      async updateObjectKeyOptimistic() {
        ops.push("db");
        return { rowsAffected: 1 };
      },
    };

    const summary = await runFar01BackfillBatch([candidate()], {
      mode: "LIVE",
      verifiedGrant: verifiedGrant({ canary_n: 1 }),
      authorization: { backfillGo: false, operatorApproval: true },
      canaryLimit: 1,
      pipelinePhase: "CANARY",
      storageMutator: storage,
      storageInspector: inspector,
      dbMutator: db,
    });

    expect(ops).toEqual(["copy", "db"]);
    // pre source, pre dest, post source, post dest
    expect(heads.length).toBeGreaterThanOrEqual(4);
    expect(summary.live_mutations_attempted).toBe(1);
    expect(summary.assets[0]!.DB_update_status).toBe("SUCCESS");
  });

  it("re-HEAD failure blocks DB update and retains source semantics", async () => {
    let dbCalls = 0;
    const summary = await runFar01BackfillBatch([candidate()], {
      mode: "LIVE",
      verifiedGrant: verifiedGrant({ canary_n: 1 }),
      authorization: { backfillGo: false, operatorApproval: true },
      canaryLimit: 1,
      storageMutator: {
        async copyObject() {},
      },
      storageInspector: {
        async headObject({ key }) {
          if (key.endsWith("/master.bin")) {
            return { exists: false, size: null, contentType: null };
          }
          return { exists: true, size: 1000, contentType: null };
        },
      },
      dbMutator: {
        async updateObjectKeyOptimistic() {
          dbCalls += 1;
          return { rowsAffected: 1 };
        },
      },
    });
    expect(dbCalls).toBe(0);
    expect(summary.assets[0]!.action).toBe("FAIL");
    expect(summary.assets[0]!.failure_reason).toMatch(/re-HEAD|destination missing/);
  });

  it("destination conflict (exists different size) → no overwrite", async () => {
    await expect(
      preMutationHeadCheck({
        inspector: {
          async headObject({ key }) {
            if (key.endsWith("/master.bin")) {
              return { exists: true, size: 50, contentType: null };
            }
            return { exists: true, size: 1000, contentType: null };
          },
        },
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: buildUserBeatAudioObjectKey({
          ownerId: OWNER,
          beatId: BEAT,
          assetId: ASSET,
          purpose: "MASTER",
        }),
        expectedSourceSize: 1000,
      }),
    ).rejects.toThrow(Far01MutationGateError);
  });

  it("concurrent source size drift → abort", async () => {
    await expect(
      preMutationHeadCheck({
        inspector: {
          async headObject() {
            return { exists: true, size: 999, contentType: null };
          },
        },
        bucket: "beat-audio",
        sourceKey: "s",
        destinationKey: "d",
        expectedSourceSize: 1000,
      }),
    ).rejects.toThrow(/size drift/);
  });

  it("postCopyReHeadVerify fails closed", async () => {
    await expect(
      postCopyReHeadVerify({
        inspector: {
          async headObject({ key }) {
            if (key === "dest") {
              return { exists: false, size: null, contentType: null };
            }
            return { exists: true, size: 1, contentType: null };
          },
        },
        bucket: "beat-audio",
        sourceKey: "src",
        destinationKey: "dest",
        expectedSize: 1,
      }),
    ).rejects.toThrow(/destination missing/);
  });

  it("invalid attestation cannot execute mutator", async () => {
    let copies = 0;
    await expect(
      runFar01BackfillBatch([candidate()], {
        mode: "LIVE",
        authorization: { backfillGo: true, operatorApproval: true },
        canaryLimit: 1,
        storageMutator: {
          async copyObject() {
            copies += 1;
          },
        },
        dbMutator: {
          async updateObjectKeyOptimistic() {
            return { rowsAffected: 1 };
          },
        },
        storageInspector: {
          async headObject() {
            return { exists: true, size: 1000, contentType: null };
          },
        },
      }),
    ).rejects.toThrow();
    expect(copies).toBe(0);
  });

  it("expired attestation cannot execute mutator", () => {
    const expired = signedArtifact({
      expires_at: new Date(Date.now() - 5000).toISOString(),
      canary_n: 1,
    });
    expect(() =>
      verifyFar01SignedGoArtifact(expired, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
      }),
    ).toThrow(/expired/);
  });
});

describe("B-04 DB/Storage loader", () => {
  it("loads DB-authoritative candidates · excludes platform/orphans · UNKNOWN checksum", async () => {
    const destKey = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: ASSET,
      purpose: "MASTER",
    });
    const { candidates, inventory } = await loadFar01BackfillCandidates({
      clientObjectKey: null,
      platformAssetCount: 3,
      orphanStorageKeys: Array.from({ length: 30 }, (_, i) => `orphan-${i}`),
      db: {
        async listUserMasterAssets() {
          return [
            {
              asset: {
                ...asset({ object_key: legacyKey() }),
                created_at: "2026-01-01T00:00:00.000Z",
              },
              beat: beat(),
            },
            {
              asset: {
                ...asset({
                  id: "11111111-1111-1111-1111-111111111111",
                  object_key: buildUserBeatAudioObjectKey({
                    ownerId: OWNER,
                    beatId: BEAT,
                    assetId: "11111111-1111-1111-1111-111111111111",
                    purpose: "MASTER",
                  }),
                  checksum_sha256: "abc",
                }),
                created_at: "2026-01-02T00:00:00.000Z",
              },
              beat: beat(),
            },
          ];
        },
        async findAssetIdByObjectKey() {
          return null;
        },
      },
      storage: {
        async headObject({ key }) {
          if (key === destKey) {
            return { exists: false, size: null, contentType: null };
          }
          return { exists: true, size: 1000, contentType: "audio/mpeg" };
        },
      },
    });

    expect(inventory.platform_excluded).toBe(3);
    expect(inventory.orphan_storage_excluded).toBe(30);
    expect(inventory.legacy_shape).toBe(1);
    expect(inventory.canonical_shape).toBe(1);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]!.asset.id).toBe(ASSET);

    const pf = runFar01Preflight({
      mapped: mapFar01BackfillAsset({
        asset: candidates[0]!.asset,
        beat: candidates[0]!.beat,
      }),
      sourceMeta: candidates[0]!.sourceMeta,
      destinationMeta: candidates[0]!.destinationMeta,
      destinationClaimedByOtherAssetId: null,
    });
    expect(pf.checksumStatus).toBe("UNKNOWN");
    expect(pf.action).toBe("MIGRATE");
  });

  it("client-controlled path cannot override DB mapping", async () => {
    expect(() =>
      assertNoClientObjectKeyAuthority({ clientObjectKey: "evil" }),
    ).toThrow(/Client must not supply/);
    await expect(
      loadFar01BackfillCandidates({
        clientObjectKey: "user/evil/path",
        db: {
          async listUserMasterAssets() {
            return [];
          },
          async findAssetIdByObjectKey() {
            return null;
          },
        },
        storage: {
          async headObject() {
            return { exists: false, size: null, contentType: null };
          },
        },
      }),
    ).rejects.toThrow(/Client must not supply/);
  });

  it("destination conflict detected via DB claim", async () => {
    const other = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const { inventory, candidates } = await loadFar01BackfillCandidates({
      db: {
        async listUserMasterAssets() {
          return [
            {
              asset: {
                ...asset({ object_key: legacyKey() }),
                created_at: "2026-01-01T00:00:00.000Z",
              },
              beat: beat(),
            },
          ];
        },
        async findAssetIdByObjectKey() {
          return other;
        },
      },
      storage: {
        async headObject() {
          return { exists: true, size: 1000, contentType: null };
        },
      },
    });
    expect(inventory.destination_conflicts).toBe(1);
    expect(candidates[0]!.destinationClaimedByOtherAssetId).toBe(other);
    const pf = runFar01Preflight({
      mapped: mapFar01BackfillAsset({
        asset: candidates[0]!.asset,
        beat: candidates[0]!.beat,
      }),
      sourceMeta: candidates[0]!.sourceMeta,
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId:
        candidates[0]!.destinationClaimedByOtherAssetId,
    });
    expect(pf.action).toBe("QUARANTINE");
  });
});

describe("Production safety — no automatic execution", () => {
  it("default dry-run zero mutations · no Backfill GO", async () => {
    const summary = await runFar01BackfillBatch([candidate()], {
      mode: "DRY_RUN",
      authorization: FAR01_DEFAULT_AUTHORIZATION,
    });
    expect(summary.live_mutations_attempted).toBe(0);
    expect(summary.authorization.backfillGo).toBe(false);
  });

  it("does not auto-run canary or fleet", () => {
    const result = buildCanaryResult({
      batchId: "x",
      selectedAssetIds: ["a", "b", "c", "d", "e"],
    });
    expect(result.verification_result).toBe("PENDING");
    expect(result.approved).toBe(false);
    expect(result.count).toBe(5);
  });
});
