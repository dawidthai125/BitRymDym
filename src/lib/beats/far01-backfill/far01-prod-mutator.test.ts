/**
 * FAR-01 production mutator adapters — unit tests (no Production I/O).
 * GC-MUT-01 / GC-MUT-02 implementation verification.
 */

import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";

import {
  assertFar01DbMutatorClientAllowed,
  assertFar01LiveMutationAuthorized,
  assertFar01MutationIdentityGate,
  assertFar01StorageMutatorClientAllowed,
  buildFar01GateCCanaryGoPayload,
  createFar01ProdDbMutator,
  createFar01ProdStorageMutator,
  executeFar01LiveAssetMutation,
  FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  FAR01_LOCKED_QUARANTINE_ASSET_IDS,
  Far01BackfillAuthorizationError,
  Far01CredentialGateError,
  Far01MutationGateError,
  isFar01LockedQuarantineAssetId,
  mapFar01BackfillAsset,
  preMutationHeadCheck,
  runFar01Preflight,
  signFar01GoArtifact,
  verifyFar01SignedGoArtifact,
  type Far01AssetSnapshot,
  type Far01BeatSnapshot,
  type Far01GoEvidenceBinding,
  type Far01SignedGoArtifact,
  type Far01StorageInspector,
  type Far01StorageMutator,
  type Far01DbMutator,
} from "@/lib/beats/far01-backfill";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const QUARANTINE = "000d406d-265e-4e49-bd3f-a542d5dd0b41";
const SCOPE = "far01-user-master-backfill";
const ISSUER = "owner-test-issuer";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

function legacyKey(assetId = ASSET): string {
  return buildLegacyUserBeatMasterObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId,
  });
}

function canonicalKey(assetId = ASSET): string {
  return buildUserBeatAudioObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId,
    purpose: "MASTER",
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

function beat(overrides?: Partial<Far01BeatSnapshot>): Far01BeatSnapshot {
  return {
    id: BEAT,
    owner_id: OWNER,
    ownership_type: "USER",
    status: "PUBLISHED",
    ...overrides,
  };
}

function mappedOk() {
  return mapFar01BackfillAsset({
    asset: asset({ object_key: legacyKey() }),
    beat: beat(),
  });
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

function verifiedGrant(canaryN = 1) {
  const payload = {
    ...buildFar01GateCCanaryGoPayload({
      issuer: ISSUER,
      operatorId: "operator-test",
      gitSha: "test-git-sha",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      batchScope: SCOPE,
    }),
    canary_n: canaryN,
  };
  const art = signFar01GoArtifact({ privateKey, payload });
  return verifyFar01SignedGoArtifact(art, {
    publicKey,
    expectedBatchScope: SCOPE,
    allowedIssuers: [ISSUER],
    expectedEvidence: evidenceFromPayload(art),
  });
}

function preflightMigrate() {
  const mapped = mappedOk();
  return {
    mapped,
    preflight: runFar01Preflight({
      mapped,
      sourceMeta: { exists: true, size: 1000, contentType: "audio/mpeg" },
      destinationMeta: { exists: false, size: null, contentType: null },
      destinationClaimedByOtherAssetId: null,
    }),
  };
}

/** In-memory Storage fake for prod storage mutator. */
function makeStorageClient(opts?: {
  sourceExists?: boolean;
  destExists?: boolean;
  sourceSize?: number;
  copyError?: string | null;
  onCopy?: () => void;
}) {
  const sourceExists = opts?.sourceExists ?? true;
  let destExists = opts?.destExists ?? false;
  const sourceSize = opts?.sourceSize ?? 1000;
  const objects = new Map<string, { size: number }>();
  if (sourceExists) objects.set(legacyKey(), { size: sourceSize });
  if (destExists) objects.set(canonicalKey(), { size: sourceSize });

  return {
    objects,
    client: {
      storage: {
        from() {
          return {
            list: async (
              folder?: string,
              options?: { limit?: number; search?: string; offset?: number },
            ) => {
              const name = options?.search ?? "";
              const key = folder ? `${folder}/${name}` : name;
              const hit = objects.get(key);
              if (!hit) return { data: [], error: null };
              return {
                data: [
                  {
                    name,
                    id: "obj-1",
                    metadata: { size: hit.size, mimetype: "audio/mpeg" },
                  },
                ],
                error: null,
              };
            },
            copy: async (from: string, to: string) => {
              opts?.onCopy?.();
              if (opts?.copyError) {
                return { data: null, error: { message: opts.copyError } };
              }
              if (!objects.has(from)) {
                return { data: null, error: { message: "source missing" } };
              }
              if (objects.has(to)) {
                return { data: null, error: { message: "already exists" } };
              }
              objects.set(to, { size: objects.get(from)!.size });
              destExists = true;
              return { data: { path: to }, error: null };
            },
          };
        },
      },
    },
  };
}

/** In-memory DB fake for prod db mutator. */
function makeDbClient(opts?: {
  objectKey?: string;
  assetId?: string;
  missing?: boolean;
  updateAffectsZero?: boolean;
  postVerifyWrong?: boolean;
}) {
  let objectKey = opts?.objectKey ?? legacyKey();
  const assetId = opts?.assetId ?? ASSET;
  let updateCalls = 0;

  const client = {
    from() {
      return {
        select() {
          return {
            eq(col: string, val: string) {
              const chain = {
                eq() {
                  return chain;
                },
                maybeSingle: async () => {
                  if (opts?.missing) return { data: null, error: null };
                  if (col === "id" && val !== assetId) {
                    return { data: null, error: null };
                  }
                  if (opts?.postVerifyWrong && updateCalls > 0) {
                    return {
                      data: {
                        id: assetId,
                        object_key: "wrong-key",
                        storage_bucket: "beat-audio",
                        beat_id: BEAT,
                      },
                      error: null,
                    };
                  }
                  return {
                    data: {
                      id: assetId,
                      object_key: objectKey,
                      storage_bucket: "beat-audio",
                      beat_id: BEAT,
                    },
                    error: null,
                  };
                },
              };
              return chain;
            },
          };
        },
        update(patch: { object_key: string }) {
          return {
            eq(col: string, val: string) {
              const preds: Record<string, string> = { [col]: val };
              const chain = {
                eq(c2: string, v2: string) {
                  preds[c2] = v2;
                  return chain;
                },
                select() {
                  return {
                    maybeSingle: async () => {
                      updateCalls += 1;
                      if (opts?.updateAffectsZero) {
                        return { data: null, error: null };
                      }
                      if (
                        preds.id !== assetId ||
                        preds.object_key !== objectKey ||
                        preds.storage_bucket !== "beat-audio"
                      ) {
                        return { data: null, error: null };
                      }
                      objectKey = patch.object_key;
                      return {
                        data: { id: assetId, object_key: objectKey },
                        error: null,
                      };
                    },
                  };
                },
              };
              return chain;
            },
          };
        },
      };
    },
    getObjectKey: () => objectKey,
    getUpdateCalls: () => updateCalls,
  };
  return client;
}

describe("GC-MUT production storage mutator", () => {
  it("1. source missing → DENY", async () => {
    const { client } = makeStorageClient({ sourceExists: false });
    const mutator = createFar01ProdStorageMutator(client);
    await expect(
      mutator.copyObject({
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
        upsert: false,
      }),
    ).rejects.toThrow(/source missing/);
  });

  it("2. destination present → DENY", async () => {
    const { client } = makeStorageClient({ destExists: true });
    const mutator = createFar01ProdStorageMutator(client);
    await expect(
      mutator.copyObject({
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
        upsert: false,
      }),
    ).rejects.toThrow(/DESTINATION_PRESENT/);
  });

  it("8. upsert must be false", async () => {
    const { client } = makeStorageClient();
    const mutator = createFar01ProdStorageMutator(client);
    await expect(
      mutator.copyObject({
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
        // @ts-expect-error — contract requires false
        upsert: true,
      }),
    ).rejects.toThrow(/upsert must be false/);
  });

  it("18. canonical destination deterministic; 19. arbitrary dest → DENY", async () => {
    const { client } = makeStorageClient();
    const mutator = createFar01ProdStorageMutator(client);
    await expect(
      mutator.copyObject({
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: "user/evil/arbitrary.bin",
        upsert: false,
      }),
    ).rejects.toThrow(/not deterministic canonical/);
  });

  it("9. COPY success path", async () => {
    let copied = 0;
    const { client, objects } = makeStorageClient({
      onCopy: () => {
        copied += 1;
      },
    });
    const mutator = createFar01ProdStorageMutator(client);
    await mutator.copyObject({
      bucket: "beat-audio",
      sourceKey: legacyKey(),
      destinationKey: canonicalKey(),
      upsert: false,
    });
    expect(copied).toBe(1);
    expect(objects.has(canonicalKey())).toBe(true);
    expect(objects.has(legacyKey())).toBe(true); // source retained
  });

  it("10. COPY failure → no side-effect DB (caller responsibility); throws", async () => {
    const { client } = makeStorageClient({ copyError: "network boom" });
    const mutator = createFar01ProdStorageMutator(client);
    await expect(
      mutator.copyObject({
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
        upsert: false,
      }),
    ).rejects.toThrow(/COPY failed.*source retained/);
  });

  it("13. service-role / admin client → DENY", () => {
    expect(() =>
      assertFar01StorageMutatorClientAllowed({ usingAdminClient: true }),
    ).toThrow(Far01CredentialGateError);
    expect(() =>
      assertFar01StorageMutatorClientAllowed({
        apiKey: "secret",
        serviceRoleKey: "secret",
      }),
    ).toThrow(/service-role/);
    expect(() =>
      assertFar01DbMutatorClientAllowed({ usingAdminClient: true }),
    ).toThrow(Far01CredentialGateError);
  });
});

describe("GC-MUT production DB mutator", () => {
  it("7. DB object_key changed → DENY", async () => {
    const db = makeDbClient({ objectKey: "user/other/legacy.bin" });
    const mutator = createFar01ProdDbMutator(db as never);
    await expect(
      mutator.updateObjectKeyOptimistic({
        assetId: ASSET,
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
      }),
    ).rejects.toThrow(/object_key !== expected legacy/);
  });

  it("6. quarantine asset → DENY", async () => {
    expect(isFar01LockedQuarantineAssetId(QUARANTINE)).toBe(true);
    expect(FAR01_LOCKED_QUARANTINE_ASSET_IDS.has(QUARANTINE)).toBe(true);
    const db = makeDbClient({ assetId: QUARANTINE, objectKey: legacyKey(QUARANTINE) });
    const mutator = createFar01ProdDbMutator(db as never);
    await expect(
      mutator.updateObjectKeyOptimistic({
        assetId: QUARANTINE,
        sourceKey: legacyKey(QUARANTINE),
        destinationKey: canonicalKey(QUARANTINE),
      }),
    ).rejects.toThrow(/LOCKED QUARANTINE/);
  });

  it("9b. COPY success → DB update success + post verify", async () => {
    const db = makeDbClient();
    const mutator = createFar01ProdDbMutator(db as never);
    const result = await mutator.updateObjectKeyOptimistic({
      assetId: ASSET,
      sourceKey: legacyKey(),
      destinationKey: canonicalKey(),
    });
    expect(result.rowsAffected).toBe(1);
    expect(db.getObjectKey()).toBe(canonicalKey());
  });

  it("11. DB update failure (0 rows) → source retained semantics", async () => {
    const db = makeDbClient({ updateAffectsZero: true });
    const mutator = createFar01ProdDbMutator(db as never);
    const result = await mutator.updateObjectKeyOptimistic({
      assetId: ASSET,
      sourceKey: legacyKey(),
      destinationKey: canonicalKey(),
    });
    expect(result.rowsAffected).toBe(0);
    expect(db.getObjectKey()).toBe(legacyKey());
  });

  it("12. post-update verification failure → failure, no cleanup", async () => {
    const db = makeDbClient({ postVerifyWrong: true });
    const mutator = createFar01ProdDbMutator(db as never);
    await expect(
      mutator.updateObjectKeyOptimistic({
        assetId: ASSET,
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
      }),
    ).rejects.toThrow(/post-update verify failed.*no cleanup/);
  });
});

describe("GC-MUT gated LIVE mutation ordering", () => {
  function inspectorForLive(opts?: {
    sourceMissing?: boolean;
    destPresent?: boolean;
    sourceSize?: number;
    afterCopyDestMissing?: boolean;
  }): Far01StorageInspector {
    let copied = false;
    return {
      async headObject({ key }) {
        if (key === legacyKey()) {
          if (opts?.sourceMissing) {
            return { exists: false, size: null, contentType: null };
          }
          return {
            exists: true,
            size: opts?.sourceSize ?? 1000,
            contentType: "audio/mpeg",
          };
        }
        if (key === canonicalKey()) {
          if (opts?.destPresent && !copied) {
            return { exists: true, size: 1000, contentType: "audio/mpeg" };
          }
          if (copied && !opts?.afterCopyDestMissing) {
            return { exists: true, size: 1000, contentType: "audio/mpeg" };
          }
          return { exists: false, size: null, contentType: null };
        }
        return { exists: false, size: null, contentType: null };
      },
      // test helper hook
      markCopied() {
        copied = true;
      },
    } as Far01StorageInspector & { markCopied: () => void };
  }

  it("3. source changed after preflight → DENY", async () => {
    const { mapped, preflight } = preflightMigrate();
    const insp = inspectorForLive({ sourceSize: 999 });
    await expect(
      executeFar01LiveAssetMutation({
        mode: "LIVE",
        verifiedGrant: verifiedGrant(1),
        authorization: { backfillGo: false, operatorApproval: true },
        mapped,
        preflight,
        expectedSourceSize: 1000,
        storageMutator: { async copyObject() {} },
        storageInspector: insp,
        dbMutator: {
          async updateObjectKeyOptimistic() {
            return { rowsAffected: 1 };
          },
        },
      }),
    ).rejects.toThrow(/size drift/);
  });

  it("4. destination changed after preflight → DENY", async () => {
    const { mapped, preflight } = preflightMigrate();
    await expect(
      executeFar01LiveAssetMutation({
        mode: "LIVE",
        verifiedGrant: verifiedGrant(1),
        authorization: { backfillGo: false, operatorApproval: true },
        mapped,
        preflight,
        expectedSourceSize: 1000,
        storageMutator: { async copyObject() {} },
        storageInspector: inspectorForLive({ destPresent: true }),
        dbMutator: {
          async updateObjectKeyOptimistic() {
            return { rowsAffected: 1 };
          },
        },
      }),
    ).rejects.toThrow(/DESTINATION_PRESENT/);
  });

  it("5. identity mismatch → DENY; 20. owner/beat mismatch → DENY", () => {
    const bad = mapFar01BackfillAsset({
      asset: asset({
        id: ASSET,
        object_key: buildLegacyUserBeatMasterObjectKey({
          ownerId: OWNER,
          beatId: BEAT,
          assetId: "ffffffff-ffff-ffff-ffff-ffffffffffff",
        }),
      }),
      beat: beat(),
    });
    expect(bad.identityMismatch).toBe(true);
    expect(() => assertFar01MutationIdentityGate(bad)).toThrow(
      /identity mismatch/,
    );

    const ownerMismatch = mapFar01BackfillAsset({
      asset: asset({ object_key: legacyKey() }),
      beat: beat({ owner_id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" }),
    });
    // remapped destination uses wrong owner → identity mismatch or dest gate
    expect(() => assertFar01MutationIdentityGate(ownerMismatch)).toThrow();
  });

  it("6b. quarantine preflight → DENY COPY", async () => {
    const qAsset = asset({
      id: QUARANTINE,
      object_key: buildLegacyUserBeatMasterObjectKey({
        ownerId: OWNER,
        beatId: BEAT,
        assetId: "ef9e21dc-0000-4000-8000-000000000001",
      }),
    });
    // Force locked id check regardless of path parse
    const mapped = {
      ...mapFar01BackfillAsset({ asset: qAsset, beat: beat() }),
      assetId: QUARANTINE,
      asset: { ...qAsset, id: QUARANTINE },
    };
    expect(() => assertFar01MutationIdentityGate(mapped)).toThrow(
      /LOCKED QUARANTINE/,
    );
  });

  it("14. missing LIVE authorization → DENY", () => {
    expect(() =>
      assertFar01LiveMutationAuthorized({
        mode: "LIVE",
        verifiedGrant: null,
        authorization: { backfillGo: true, operatorApproval: true },
      }),
    ).toThrow(Far01BackfillAuthorizationError);
  });

  it("15. invalid A2 → DENY", () => {
    expect(() =>
      assertFar01LiveMutationAuthorized({
        mode: "LIVE",
        verifiedGrant: { go: true } as never,
        authorization: { backfillGo: false, operatorApproval: true },
      }),
    ).toThrow(/verified|grant|A2/i);
  });

  it("16. wrong mode → DENY", () => {
    expect(() =>
      assertFar01LiveMutationAuthorized({
        mode: "DRY_RUN",
        verifiedGrant: verifiedGrant(1),
        authorization: { backfillGo: false, operatorApproval: true },
      }),
    ).toThrow(/mode must be LIVE/);
  });

  it("17. retry with existing destination → DENY / CONFLICT", async () => {
    await expect(
      preMutationHeadCheck({
        inspector: {
          async headObject({ key }) {
            if (key === canonicalKey()) {
              return { exists: true, size: 1000, contentType: null };
            }
            return { exists: true, size: 1000, contentType: null };
          },
        },
        bucket: "beat-audio",
        sourceKey: legacyKey(),
        destinationKey: canonicalKey(),
        expectedSourceSize: 1000,
      }),
    ).rejects.toThrow(/DESTINATION_PRESENT|CONFLICT/);
  });

  it("9+10. COPY success → DB update; COPY failure → no DB update", async () => {
    const { mapped, preflight } = preflightMigrate();
    let dbCalls = 0;
    let copied = false;
    const insp: Far01StorageInspector = {
      async headObject({ key }) {
        if (key === legacyKey()) {
          return { exists: true, size: 1000, contentType: "audio/mpeg" };
        }
        if (key === canonicalKey()) {
          return copied
            ? { exists: true, size: 1000, contentType: "audio/mpeg" }
            : { exists: false, size: null, contentType: null };
        }
        return { exists: false, size: null, contentType: null };
      },
    };
    const storage: Far01StorageMutator = {
      async copyObject(p) {
        expect(p.upsert).toBe(false);
        copied = true;
      },
    };
    const db: Far01DbMutator = {
      async updateObjectKeyOptimistic() {
        dbCalls += 1;
        return { rowsAffected: 1 };
      },
    };

    const ok = await executeFar01LiveAssetMutation({
      mode: "LIVE",
      verifiedGrant: verifiedGrant(1),
      authorization: { backfillGo: false, operatorApproval: true },
      mapped,
      preflight,
      expectedSourceSize: 1000,
      storageMutator: storage,
      storageInspector: insp,
      dbMutator: db,
    });
    expect(ok.dbUpdateStatus).toBe("SUCCESS");
    expect(dbCalls).toBe(1);

    dbCalls = 0;
    copied = false;
    const failingStorage: Far01StorageMutator = {
      async copyObject() {
        throw new Far01MutationGateError("COPY failed — source retained");
      },
    };
    await expect(
      executeFar01LiveAssetMutation({
        mode: "LIVE",
        verifiedGrant: verifiedGrant(1),
        authorization: { backfillGo: false, operatorApproval: true },
        mapped,
        preflight,
        expectedSourceSize: 1000,
        storageMutator: failingStorage,
        storageInspector: insp,
        dbMutator: db,
      }),
    ).rejects.toThrow(/COPY failed/);
    expect(dbCalls).toBe(0);
  });

  it("inventory classes: 67 eligible / 1 quarantine / 2 canonical SKIP / 3 platform ineligible", () => {
    expect(FAR01_LOCKED_QUARANTINE_ASSET_IDS.size).toBe(1);
    expect(isFar01LockedQuarantineAssetId(QUARANTINE)).toBe(true);
    expect(isFar01LockedQuarantineAssetId(ASSET)).toBe(false);

    const canonicalMapped = mapFar01BackfillAsset({
      asset: asset({ object_key: canonicalKey() }),
      beat: beat(),
    });
    expect(canonicalMapped.alreadyCanonical).toBe(true);
    expect(() => assertFar01MutationIdentityGate(canonicalMapped)).toThrow(
      /already canonical/,
    );

    const platformBeat = beat({ ownership_type: "PLATFORM", owner_id: null });
    const platformMapped = mapFar01BackfillAsset({
      asset: asset({
        object_key: `platform/${BEAT}/${ASSET}/master.bin`,
      }),
      beat: platformBeat,
    });
    expect(() => assertFar01MutationIdentityGate(platformMapped)).toThrow();

    // Eligible pool size is an evidence constant — mutator accepts MIGRATE only.
    const { preflight } = preflightMigrate();
    expect(preflight.action).toBe("MIGRATE");
    expect(FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS).toBe("live_mutator");
  });
});

describe("GC-MUT no auto-execution / no FromEnv secrets", () => {
  it("prod mutator factories require injected client (no hidden admin import)", async () => {
    const src = await import(
      "@/lib/beats/far01-backfill/adapters/prod-storage-mutator"
    );
    const dbMod = await import(
      "@/lib/beats/far01-backfill/adapters/prod-db-mutator"
    );
    expect(typeof src.createFar01ProdStorageMutator).toBe("function");
    expect(typeof dbMod.createFar01ProdDbMutator).toBe("function");
    expect("createFar01ProdStorageMutatorFromEnv" in src).toBe(false);
    expect("createFar01ProdDbMutatorFromEnv" in dbMod).toBe(false);
    // Static guarantee: modules must not reference admin client symbol.
    const fs = await import("node:fs");
    const path = await import("node:path");
    const root = path.join(process.cwd(), "src/lib/beats/far01-backfill/adapters");
    for (const file of ["prod-storage-mutator.ts", "prod-db-mutator.ts"]) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      expect(text).not.toMatch(/from\s+["']@\/lib\/supabase\/admin["']/);
      expect(text).not.toMatch(/import\s+.*createSupabaseAdminClient/);
      expect(text).not.toContain("process.env.SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  it("vi spy: factories do not call network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const { client } = makeStorageClient();
    createFar01ProdStorageMutator(client);
    createFar01ProdDbMutator(makeDbClient() as never);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
