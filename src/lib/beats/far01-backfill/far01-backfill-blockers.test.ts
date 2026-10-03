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
  buildFar01FleetApprovalPendingResult,
  buildFar01FleetVerifyCanaryResult,
  FAR01_DEFAULT_AUTHORIZATION,
  FAR01_OWNER_CANARY_N,
  Far01BackfillAuthorizationError,
  Far01CanaryGateError,
  loadFar01BackfillCandidates,
  mapFar01BackfillAsset,
  postCopyReHeadVerify,
  preMutationHeadCheck,
  runFar01BackfillBatch,
  runFar01Preflight,
  selectCanaryAssetIds,
  isFar01CanaryEligible,
  buildFar01FleetGoPayload,
  buildFar01GateCCanaryGoPayload,
  FAR01_CANARY_EVIDENCE_BATCH_ID,
  FAR01_FLEET_EVIDENCE_BINDING_V1,
  FAR01_GATE_C_EVIDENCE_BINDING_V1,
  FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  FAR01_LIVE_POSTGRES_ROLE,
  assertCredentialClassIsDryRunReadonly,
  assertCredentialClassIsLiveMutator,
  buildFar01LiveCreateClientArgs,
  resolveFar01LiveMutatorCredentials,
  serializeFar01GoArtifactPayload,
  signFar01GoArtifact,
  validateCanaryLimit,
  verifyFar01SignedGoArtifact,
  type Far01AssetSnapshot,
  type Far01BackfillCandidate,
  type Far01BeatSnapshot,
  type Far01CanarySelectionRow,
  type Far01GoEvidenceBinding,
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

function baseGoPayload(
  overrides: Partial<Omit<Far01SignedGoArtifact, "signature">> = {},
): Omit<Far01SignedGoArtifact, "signature"> {
  return {
    ...buildFar01GateCCanaryGoPayload({
      issuer: ISSUER,
      operatorId: "operator-test",
      gitSha: "test-git-sha",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      batchScope: SCOPE,
    }),
    ...overrides,
  };
}

function evidenceFromPayload(
  payload: Omit<Far01SignedGoArtifact, "signature">,
): Far01GoEvidenceBinding {
  return {
    phase: payload.phase,
    canary_n: payload.canary_n,
    eligible_candidate_count: payload.eligible_candidate_count,
    quarantine_count: payload.quarantine_count,
    inventory_legacy: payload.inventory_legacy,
    inventory_canonical: payload.inventory_canonical,
    inventory_platform: payload.inventory_platform,
    inventory_orphan: payload.inventory_orphan,
    evidence_dry_run_id: payload.evidence_dry_run_id,
    evidence_checksum_campaign_id: payload.evidence_checksum_campaign_id,
  };
}

function signedArtifact(
  overrides: Partial<Omit<Far01SignedGoArtifact, "signature">> = {},
): Far01SignedGoArtifact {
  return signFar01GoArtifact({
    privateKey,
    payload: baseGoPayload(overrides),
  });
}

function verifiedGrant(
  overrides: Partial<Omit<Far01SignedGoArtifact, "signature">> = {},
) {
  const art = signedArtifact(overrides);
  return verifyFar01SignedGoArtifact(art, {
    publicKey,
    expectedBatchScope: SCOPE,
    allowedIssuers: [ISSUER],
    expectedEvidence: evidenceFromPayload(art),
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
      od_bf_08: false,
      phase: "CANARY",
      batch_scope: "s",
      expires_at: "t",
      canary_n: 5,
      issuer: "i",
      operator_id: "op",
      git_sha: "sha",
      eligible_candidate_count: 67,
      quarantine_count: 1,
      inventory_legacy: 68,
      inventory_canonical: 2,
      inventory_platform: 3,
      inventory_orphan: 28,
      evidence_dry_run_id: "dry",
      evidence_checksum_campaign_id: "camp",
    });
    expect(a).toContain('"od_bf_08":false');
    expect(a).toContain('"phase":"CANARY"');
    expect(a).toContain('"eligible_candidate_count":67');
    expect(a).toContain('"quarantine_count":1');
  });

  it("Gate C evidence binding constant matches production snapshot", () => {
    expect(FAR01_GATE_C_EVIDENCE_BINDING_V1).toEqual({
      phase: "CANARY",
      canary_n: 5,
      eligible_candidate_count: 67,
      quarantine_count: 1,
      inventory_legacy: 68,
      inventory_canonical: 2,
      inventory_platform: 3,
      inventory_orphan: 28,
      evidence_dry_run_id: "far01-bf-2026-10-02T23-37-58-039Z",
      evidence_checksum_campaign_id: "far01-checksum-campaign-2026-10-03",
    });
  });

  it("Fleet evidence binding pins post-canary inventory (not Gate C V1)", () => {
    expect(FAR01_FLEET_EVIDENCE_BINDING_V1).toEqual({
      phase: "CANARY",
      canary_n: 5,
      eligible_candidate_count: 62,
      quarantine_count: 1,
      inventory_legacy: 63,
      inventory_canonical: 7,
      inventory_platform: 3,
      inventory_orphan: 33,
      evidence_dry_run_id: "far01-bf-2026-10-02T23-37-58-039Z",
      evidence_checksum_campaign_id: "far01-checksum-campaign-2026-10-03",
    });
    expect(FAR01_FLEET_EVIDENCE_BINDING_V1).not.toEqual(
      FAR01_GATE_C_EVIDENCE_BINDING_V1,
    );
    expect(FAR01_CANARY_EVIDENCE_BATCH_ID).toBe(
      "far01-bf-2026-10-03T04-06-42-045Z",
    );
  });

  it("Fleet A2 payload uses post-canary binding; stale Gate C binding DENY", () => {
    const unsigned = buildFar01FleetGoPayload({
      issuer: ISSUER,
      operatorId: "op",
      gitSha: "abc",
      expiresAt: "2099-01-01T00:00:00.000Z",
      batchScope: SCOPE,
    });
    expect(unsigned.eligible_candidate_count).toBe(62);
    expect(unsigned.inventory_legacy).toBe(63);
    expect(unsigned.od_bf_08).toBe(false);
    const art = signFar01GoArtifact({ privateKey, payload: unsigned });
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
        expectedEvidence: FAR01_GATE_C_EVIDENCE_BINDING_V1,
      }),
    ).toThrow(/evidence binding mismatch/);
    expect(
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
        expectedEvidence: FAR01_FLEET_EVIDENCE_BINDING_V1,
      }).eligibleCandidateCount,
    ).toBe(62);
  });

  it("od_bf_08 true → refuse sign and verify DENY", () => {
    expect(() =>
      signFar01GoArtifact({
        privateKey,
        payload: baseGoPayload({ od_bf_08: true }),
      }),
    ).toThrow(/od_bf_08 must be false/);
  });

  it("evidence binding mismatch → DENY", () => {
    const art = signedArtifact();
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
        expectedEvidence: {
          ...evidenceFromPayload(art),
          eligible_candidate_count: 66,
        },
      }),
    ).toThrow(/evidence binding mismatch/);
  });

  it("invalid signature → DENY", () => {
    const art = signedArtifact();
    art.signature = toCorruptSignature(art.signature);
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
        expectedEvidence: evidenceFromPayload(art),
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
        expectedEvidence: evidenceFromPayload(art),
      }),
    ).toThrow(/expired/);
  });

  it("wrong scope → DENY", () => {
    const art = signedArtifact();
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: "other-scope",
        allowedIssuers: [ISSUER],
        expectedEvidence: evidenceFromPayload(art),
      }),
    ).toThrow(/wrong batch_scope/);
  });

  it("wrong issuer → DENY", () => {
    const art = signedArtifact();
    expect(() =>
      verifyFar01SignedGoArtifact(art, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: ["not-this-issuer"],
        expectedEvidence: evidenceFromPayload(art),
      }),
    ).toThrow(/invalid issuer/);
  });

  it("missing artifact → DENY", () => {
    expect(() =>
      verifyFar01SignedGoArtifact(null, {
        publicKey,
        expectedBatchScope: SCOPE,
        allowedIssuers: [ISSUER],
        expectedEvidence: FAR01_GATE_C_EVIDENCE_BINDING_V1,
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

  it("N=5 same inventory → same 5 IDs; excludes quarantine/canonical/platform/conflict/anomaly/incomplete", () => {
    /** Frozen production-preview canary set (Gate C; not executed). */
    const EXPECTED_CANARY_5 = [
      "06f0226f-86e4-48fd-98ce-05bf333959d2",
      "5810a1a7-d494-461e-b994-a060c27f68d4",
      "2a24d6f5-f330-4d7b-93d3-05dc5a304bfa",
      "6170c8ee-cbe3-4b62-9ecc-459224869673",
      "10b7d85a-4aef-4d03-9626-e4c546f81215",
    ] as const;

    const excluded: Far01CanarySelectionRow[] = [
      {
        id: "000d406d-265e-4e49-bd3f-a542d5dd0b41",
        created_at: "2020-01-01T00:00:00.000Z",
        action: "QUARANTINE",
        is_quarantine: true,
        identity_anomaly: true,
      },
      {
        id: "canonical-already",
        created_at: "2020-01-01T00:00:00.000Z",
        action: "SKIP",
        is_canonical: true,
      },
      {
        id: "platform-asset",
        created_at: "2020-01-01T00:00:00.000Z",
        action: "SKIP",
        is_platform: true,
      },
      {
        id: "dest-conflict",
        created_at: "2020-01-01T00:00:00.000Z",
        action: "MIGRATE",
        destination_conflict: true,
      },
      {
        id: "incomplete-evidence",
        created_at: "2020-01-01T00:00:00.000Z",
        action: "MIGRATE",
        incomplete_evidence: true,
      },
    ];

    const eligible: Far01CanarySelectionRow[] = [
      ...EXPECTED_CANARY_5.map((id, i) => ({
        id,
        created_at: `2026-01-01T00:00:0${i}.000Z`,
        action: "MIGRATE" as const,
      })),
      ...Array.from({ length: 62 }, (_, i) => ({
        id: `eligible-${String(i).padStart(3, "0")}`,
        created_at: `2026-02-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        action: "MIGRATE" as const,
      })),
    ];

    expect(eligible).toHaveLength(67);
    const inventory = [...excluded, ...eligible].reverse();

    const first = selectCanaryAssetIds({
      rows: inventory,
      canaryLimit: FAR01_OWNER_CANARY_N,
    });
    const second = selectCanaryAssetIds({
      rows: inventory,
      canaryLimit: FAR01_OWNER_CANARY_N,
    });

    expect(first).toEqual([...EXPECTED_CANARY_5]);
    expect(second).toEqual(first);
    expect(first).not.toContain("000d406d-265e-4e49-bd3f-a542d5dd0b41");
    expect(isFar01CanaryEligible(excluded[0]!)).toBe(false);
    expect(isFar01CanaryEligible(excluded[3]!)).toBe(false);
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

  it("Fleet Pre-GO VERIFY passes; APPROVAL pending DENY Fleet; Owner approval enables", () => {
    const ids = [
      "06f0226f-86e4-48fd-98ce-05bf333959d2",
      "5810a1a7-d494-461e-b994-a060c27f68d4",
      "2a24d6f5-f330-4d7b-93d3-05dc5a304bfa",
      "6170c8ee-cbe3-4b62-9ecc-459224869673",
      "10b7d85a-4aef-4d03-9626-e4c546f81215",
    ];
    const verify = buildFar01FleetVerifyCanaryResult({
      canaryBatchId: FAR01_CANARY_EVIDENCE_BATCH_ID,
      selectedAssetIds: ids,
    });
    expect(verify.verification_result).toBe("VERIFIED");
    expect(verify.approved).toBe(false);
    expect(verify.status).toBe("PASS");

    const approvalPending = buildFar01FleetApprovalPendingResult({ verify });
    expect(approvalPending.approved).toBe(false);
    expect(() =>
      assertFleetPhaseAllowed({
        phase: "FLEET",
        verifiedCanary: approvalPending,
      }),
    ).toThrow(/not APPROVED/);

    const ownerApproved = { ...approvalPending, approved: true };
    expect(() =>
      assertFleetPhaseAllowed({
        phase: "FLEET",
        verifiedCanary: ownerApproved,
      }),
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

  it("destination present (any size) → HARD STOP no overwrite", async () => {
    await expect(
      preMutationHeadCheck({
        inspector: {
          async headObject({ key }) {
            if (key.endsWith("/master.bin")) {
              return { exists: true, size: 1000, contentType: null };
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
    ).rejects.toThrow(/DESTINATION_PRESENT/);
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
        expectedEvidence: evidenceFromPayload(expired),
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

describe("Gate C LIVE credential boundary (design — not provisioned)", () => {
  it("LIVE class is distinct from R1 readonly", () => {
    expect(FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS).toBe("live_mutator");
    expect(() =>
      assertCredentialClassIsDryRunReadonly("live_mutator"),
    ).toThrow(/Dry-run denied/);
    expect(() => assertCredentialClassIsLiveMutator("readonly")).toThrow(
      /LIVE denied/,
    );
    expect(() => assertCredentialClassIsLiveMutator("live_mutator")).not.toThrow();
  });

  it("resolveFar01LiveMutatorCredentials fails closed without provisioned env", () => {
    expect(() => resolveFar01LiveMutatorCredentials({})).toThrow(
      /FAR01_LIVE_SUPABASE_URL/,
    );
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: "jwt-placeholder",
        FAR01_LIVE_CREDENTIAL_CLASS: "readonly",
      }),
    ).toThrow(/live_mutator/);
  });

  it("rejects service-role as LIVE apikey", () => {
    // Minimal unsigned-looking JWT with correct role claim for resolve gate;
    // service-role deny is on apikey transport, not JWT body.
    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        role: FAR01_LIVE_POSTGRES_ROLE,
        iss: "supabase",
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const liveJwt = `${header}.${payload}.x`;
    expect(() =>
      buildFar01LiveCreateClientArgs({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: liveJwt,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
        FAR01_LIVE_API_KEY: "service-role-secret",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-secret",
      }),
    ).toThrow(/service-role|SERVICE_ROLE/i);
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
