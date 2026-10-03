import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";

import { createFar01ProdDbReader } from "./adapters/prod-db-reader";
import { createFar01ProdStorageInspector } from "./adapters/prod-storage-inspector";
import {
  FAR01_HISTORICAL_INVENTORY_BASELINE,
  refreshFar01Inventory,
} from "./inventory-refresh";
import type { Far01DbReader } from "./loader";
import { runFar01ProdDryRun } from "./prod-dry-run";
import {
  assertNoSecretsInArchive,
  buildFar01DryRunArchiveDocument,
  serializeFar01DryRunArchive,
  writeFar01DryRunArchiveFile,
} from "./report-archive";
import {
  FAR01_DRYRUN_ENV,
  FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS,
  assertFar01DryRunNotUsingAdminClient,
  buildFar01DryRunCreateClientArgs,
  resolveFar01DryRunApiKey,
  resolveFar01DryRunClientTransport,
  resolveFar01DryRunReadonlyCredentials,
} from "./readonly-client";
import { Far01CredentialGateError } from "./errors";
import type { Far01StorageInspector } from "./mutators";
import type {
  Far01AssetSnapshot,
  Far01BeatSnapshot,
  Far01BatchSummary,
} from "./types";
import { FAR01_DEFAULT_AUTHORIZATION } from "./types";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHER_ASSET = "ffffffff-ffff-ffff-ffff-ffffffffffff";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length) {
    const d = tempDirs.pop();
    if (d) await rm(d, { recursive: true, force: true });
  }
});

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
): Far01AssetSnapshot & { created_at?: string } {
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
    created_at: "2026-01-01T00:00:00.000Z",
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

describe("IA-5 credential boundary", () => {
  it("resolves R1 readonly credentials", () => {
    const creds = resolveFar01DryRunReadonlyCredentials({
      [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
      [FAR01_DRYRUN_ENV.key]: "readonly-key-value",
      [FAR01_DRYRUN_ENV.credentialClass]: FAR01_DRYRUN_REQUIRED_CREDENTIAL_CLASS,
    });
    expect(creds.credentialClass).toBe("readonly");
    expect(creds.key).toBe("readonly-key-value");
  });

  it("fail closed on missing credentials", () => {
    expect(() =>
      resolveFar01DryRunReadonlyCredentials({
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
      }),
    ).toThrow(Far01CredentialGateError);
  });

  it("fail closed on wrong credential class", () => {
    expect(() =>
      resolveFar01DryRunReadonlyCredentials({
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
        [FAR01_DRYRUN_ENV.key]: "k",
        [FAR01_DRYRUN_ENV.credentialClass]: "service_role",
      }),
    ).toThrow(/expected "readonly"/);
  });

  it("denies service-role key equality (no fallback)", () => {
    expect(() =>
      resolveFar01DryRunReadonlyCredentials({
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
        [FAR01_DRYRUN_ENV.key]: "same-secret",
        [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
        SUPABASE_SERVICE_ROLE_KEY: "same-secret",
      }),
    ).toThrow(/must not equal SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("denies FAR01_DRYRUN_USE_SERVICE_ROLE", () => {
    expect(() =>
      resolveFar01DryRunReadonlyCredentials({
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
        [FAR01_DRYRUN_ENV.key]: "readonly-key",
        [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
        FAR01_DRYRUN_USE_SERVICE_ROLE: "1",
      }),
    ).toThrow(/forbidden/);
  });

  it("denies admin client flag", () => {
    expect(() =>
      assertFar01DryRunNotUsingAdminClient({ usingAdminClient: true }),
    ).toThrow(/createSupabaseAdminClient is forbidden/);
  });

  it("resolves API key from FAR01_DRYRUN_API_KEY", () => {
    expect(
      resolveFar01DryRunApiKey({
        [FAR01_DRYRUN_ENV.apiKey]: "anon-or-publishable",
      }),
    ).toBe("anon-or-publishable");
  });

  it("falls back to NEXT_PUBLIC_SUPABASE_ANON_KEY for apikey", () => {
    expect(
      resolveFar01DryRunApiKey({
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon",
      }),
    ).toBe("public-anon");
  });

  it("fail closed on missing API key", () => {
    expect(() => resolveFar01DryRunApiKey({})).toThrow(/publishable\/anon/);
  });

  it("denies service-role as API key", () => {
    expect(() =>
      resolveFar01DryRunApiKey({
        [FAR01_DRYRUN_ENV.apiKey]: "elevated",
        SUPABASE_SERVICE_ROLE_KEY: "elevated",
      }),
    ).toThrow(/must not equal SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("denies sb_secret_ as API key", () => {
    expect(() =>
      resolveFar01DryRunApiKey({
        [FAR01_DRYRUN_ENV.apiKey]: "sb_secret_example",
      }),
    ).toThrow(/sb_secret_/);
  });

  it("separates apikey from R1 JWT (Authorization via accessToken)", async () => {
    const args = buildFar01DryRunCreateClientArgs({
      [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
      [FAR01_DRYRUN_ENV.key]: "r1-jwt-token-value",
      [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
      [FAR01_DRYRUN_ENV.apiKey]: "anon-api-key-value",
    });
    expect(args.apiKey).toBe("anon-api-key-value");
    expect(args.r1Jwt).toBe("r1-jwt-token-value");
    expect(args.apiKey).not.toBe(args.r1Jwt);
    await expect(args.options.accessToken()).resolves.toBe(args.r1Jwt);
    expect(args.options.auth.persistSession).toBe(false);
  });

  it("fail closed when API key equals R1 JWT", () => {
    expect(() =>
      resolveFar01DryRunClientTransport({
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
        [FAR01_DRYRUN_ENV.key]: "same-value",
        [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
        [FAR01_DRYRUN_ENV.apiKey]: "same-value",
      }),
    ).toThrow(/must not be used as apikey/);
  });

  it("works without service-role env when anon API key + R1 JWT present", () => {
    const transport = resolveFar01DryRunClientTransport({
      [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
      [FAR01_DRYRUN_ENV.key]: "r1-jwt",
      [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    });
    expect(transport.apiKey).toBe("anon-key");
    expect(transport.r1Jwt).toBe("r1-jwt");
  });
});

describe("IA-1 prod DB reader surface", () => {
  it("exposes only Far01DbReader methods", () => {
    const listChain = {
      eq() {
        return listChain;
      },
      in() {
        return listChain;
      },
      then(
        resolve: (v: unknown) => unknown,
        reject?: (e: unknown) => unknown,
      ) {
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    const client = {
      from() {
        return {
          select() {
            return listChain;
          },
        };
      },
    };

    const reader = createFar01ProdDbReader(client as never);
    expect(Object.keys(reader).sort()).toEqual([
      "findAssetIdByObjectKey",
      "listUserMasterAssets",
    ]);
    expect("insert" in reader).toBe(false);
    expect("update" in reader).toBe(false);
    expect("delete" in reader).toBe(false);
  });

  it("maps SELECT join rows and destination claim lookup", async () => {
    const key = legacyKey();
    const listClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              in() {
                return this;
              },
              then(
                resolve: (v: unknown) => unknown,
                reject?: (e: unknown) => unknown,
              ) {
                return Promise.resolve({
                  data: [
                    {
                      id: ASSET,
                      beat_id: BEAT,
                      purpose: "MASTER",
                      status: "READY",
                      storage_bucket: "beat-audio",
                      object_key: key,
                      content_type: "audio/mpeg",
                      byte_size: 1000,
                      checksum_sha256: null,
                      is_active: true,
                      replaced_by_asset_id: null,
                      created_at: "2026-01-01T00:00:00.000Z",
                      beats: {
                        id: BEAT,
                        owner_id: OWNER,
                        ownership_type: "USER",
                        status: "PUBLISHED",
                      },
                    },
                  ],
                  error: null,
                }).then(resolve, reject);
              },
            };
          },
        };
      },
    };
    const reader = createFar01ProdDbReader(listClient as never);
    const rows = await reader.listUserMasterAssets();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asset.id).toBe(ASSET);
    expect(rows[0]!.beat.ownership_type).toBe("USER");

    const claimClient = {
      from() {
        return {
          select() {
            return {
              eq() {
                return this;
              },
              maybeSingle: async () => ({
                data: { id: OTHER_ASSET },
                error: null,
              }),
            };
          },
        };
      },
    };
    const claimReader = createFar01ProdDbReader(claimClient as never);
    await expect(
      claimReader.findAssetIdByObjectKey(canonicalKey()),
    ).resolves.toBe(OTHER_ASSET);
  });
});

describe("IA-2 prod Storage inspector surface", () => {
  it("exposes only headObject and returns metadata", async () => {
    const client = {
      storage: {
        from() {
          return {
            list: async () => ({
              data: [
                {
                  name: "master.bin",
                  id: "obj-1",
                  metadata: { size: 42, mimetype: "audio/mpeg" },
                },
              ],
              error: null,
            }),
          };
        },
      },
    };
    const inspector = createFar01ProdStorageInspector(client);
    expect(Object.keys(inspector)).toEqual(["headObject"]);
    expect("copy" in inspector).toBe(false);
    expect("upload" in inspector).toBe(false);
    expect("remove" in inspector).toBe(false);
    expect("move" in inspector).toBe(false);

    const meta = await inspector.headObject({
      bucket: "beat-audio",
      key: "user/a/b/c/master.bin",
    });
    expect(meta).toEqual({
      exists: true,
      size: 42,
      contentType: "audio/mpeg",
    });
  });

  it("returns exists=false for missing / traversal keys", async () => {
    const client = {
      storage: {
        from() {
          return {
            list: async () => ({ data: [], error: null }),
          };
        },
      },
    };
    const inspector = createFar01ProdStorageInspector(client);
    await expect(
      inspector.headObject({ bucket: "beat-audio", key: "user/../x.bin" }),
    ).resolves.toEqual({ exists: false, size: null, contentType: null });
  });
});

describe("IA-3 inventory refresh", () => {
  function mockPorts(opts?: {
    objectKey?: string;
    checksum?: string | null;
    destClaim?: string | null;
    platform?: number;
    orphans?: string[];
  }) {
    const objectKey = opts?.objectKey ?? legacyKey();
    const a = asset({
      object_key: objectKey,
      checksum_sha256: opts?.checksum === undefined ? null : opts.checksum,
    });
    const db: Far01DbReader = {
      async listUserMasterAssets() {
        return [{ asset: a, beat: beat() }];
      },
      async findAssetIdByObjectKey(key: string) {
        if (opts?.destClaim && key === canonicalKey()) return opts.destClaim;
        return null;
      },
    };
    const storage: Far01StorageInspector = {
      async headObject({ key }) {
        if (key === objectKey) {
          return { exists: true, size: 1000, contentType: "audio/mpeg" };
        }
        return { exists: false, size: null, contentType: null };
      },
    };
    return {
      db,
      storage,
      countPlatformMasterAssets: async () => opts?.platform ?? 0,
      listOrphanStorageKeys: async () => opts?.orphans ?? [],
    };
  }

  it("uses live counts not historical baseline as truth", async () => {
    const result = await refreshFar01Inventory(
      mockPorts({ platform: 9, orphans: ["user/orphan.bin"] }),
    );
    expect(result.inventory.platform_excluded).toBe(9);
    expect(result.inventory.orphan_storage_excluded).toBe(1);
    expect(FAR01_HISTORICAL_INVENTORY_BASELINE.legacy_user).toBe(68);
    expect(result.historical_delta.baseline.evidence_class).toBe("HISTORICAL");
    expect(result.historical_delta.live.platform).toBe(9);
    expect(result.assets[0]!.expected_canonical_key).toBe(canonicalKey());
  });

  it("checksum NULL → UNKNOWN; identity mismatch → QUARANTINE", async () => {
    const anomalyKey = `user/${OWNER}/${BEAT}/master/${OTHER_ASSET}.bin`;
    const result = await refreshFar01Inventory(
      mockPorts({ objectKey: anomalyKey }),
    );
    expect(result.assets[0]!.checksum_status).toBe("UNKNOWN");
    expect(result.assets[0]!.identity_anomaly).toBe(true);
    expect(result.assets[0]!.action).toBe("QUARANTINE");
  });

  it("flags destination conflict", async () => {
    const result = await refreshFar01Inventory(
      mockPorts({ destClaim: OTHER_ASSET }),
    );
    expect(result.inventory.destination_conflicts).toBe(1);
    expect(result.assets[0]!.destination_claimed_by_other_asset_id).toBe(
      OTHER_ASSET,
    );
  });
});

describe("IA-4 report archive", () => {
  function sampleSummary(
    overrides?: Partial<Far01BatchSummary>,
  ): Far01BatchSummary {
    return {
      batch_id: "far01-bf-test",
      mode: "DRY_RUN",
      started_at: "2026-01-01T00:00:00.000Z",
      finished_at: "2026-01-01T00:00:01.000Z",
      total: 1,
      migrate: 1,
      skip: 0,
      quarantine: 0,
      fail: 0,
      owner_review: 0,
      live_mutations_attempted: 0,
      authorization: FAR01_DEFAULT_AUTHORIZATION,
      assets: [
        {
          batch_id: "far01-bf-test",
          asset_id: ASSET,
          source_key: legacyKey(),
          destination_key: canonicalKey(),
          started_at: "2026-01-01T00:00:00.000Z",
          finished_at: "2026-01-01T00:00:01.000Z",
          status: "PASS",
          failure_reason: null,
          source_size: 1000,
          destination_size: 1000,
          checksum_status: "UNKNOWN",
          DB_update_status: "SKIPPED",
          retry_count: 0,
          action: "MIGRATE",
          mode: "DRY_RUN",
          size_match: true,
          content_identity: "UNKNOWN",
        },
      ],
      ...overrides,
    };
  }

  it("serializes required fields deterministically without secrets", () => {
    const doc = buildFar01DryRunArchiveDocument({
      summary: sampleSummary(),
      gitSha: "f9500b3",
      operatorId: "owner-test",
      inventory: {
        loaded_at: "2026-01-01T00:00:00.000Z",
        user_master_rows: 1,
        legacy_shape: 1,
        canonical_shape: 0,
        platform_excluded: 0,
        orphan_storage_excluded: 0,
        destination_conflicts: 0,
        candidate_count: 1,
      },
    });
    expect(doc.mode).toBe("DRY_RUN");
    expect(doc.live_mutations_attempted).toBe(0);
    expect(doc.git_sha).toBe("f9500b3");
    expect(doc.operator_id).toBe("owner-test");
    expect(doc.assets[0]!.checksum_status).toBe("UNKNOWN");
    const text = serializeFar01DryRunArchive(doc);
    expect(text).toContain('"batch_id"');
    expect(text).not.toContain("SERVICE_ROLE");
    assertNoSecretsInArchive(doc);
  });

  it("refuses mutation counter != 0 and secret-like fields", () => {
    expect(() =>
      buildFar01DryRunArchiveDocument({
        summary: sampleSummary({ live_mutations_attempted: 1 }),
        gitSha: "abc",
        operatorId: "op",
        inventory: {
          loaded_at: "t",
          user_master_rows: 0,
          legacy_shape: 0,
          canonical_shape: 0,
          platform_excluded: 0,
          orphan_storage_excluded: 0,
          destination_conflicts: 0,
          candidate_count: 0,
        },
      }),
    ).toThrow(/live_mutations_attempted/);

    expect(() =>
      assertNoSecretsInArchive({ api_key: "sk-secret-value-here" }),
    ).toThrow(/secret/);
  });

  it("writes durable JSON archive", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "far01-archive-"));
    tempDirs.push(dir);
    const out = path.join(dir, "report.json");
    const doc = buildFar01DryRunArchiveDocument({
      summary: sampleSummary(),
      gitSha: "f9500b3",
      operatorId: "owner-test",
      inventory: {
        loaded_at: "2026-01-01T00:00:00.000Z",
        user_master_rows: 1,
        legacy_shape: 1,
        canonical_shape: 0,
        platform_excluded: 0,
        orphan_storage_excluded: 0,
        destination_conflicts: 0,
        candidate_count: 1,
      },
    });
    const written = await writeFar01DryRunArchiveFile({ doc, outputPath: out });
    const body = JSON.parse(await readFile(written, "utf8"));
    expect(body.batch_id).toBe("far01-bf-test");
    expect(body.live_mutations_attempted).toBe(0);
  });
});

describe("IA-6 prod dry-run entrypoint composition", () => {
  function injectedPorts(): {
    db: Far01DbReader;
    storage: Far01StorageInspector;
    countPlatformMasterAssets: () => Promise<number>;
    listOrphanStorageKeys: () => Promise<string[]>;
  } {
    const objectKey = legacyKey();
    const a = asset({ object_key: objectKey });
    return {
      db: {
        async listUserMasterAssets() {
          return [{ asset: a, beat: beat() }];
        },
        async findAssetIdByObjectKey() {
          return null;
        },
      },
      storage: {
        async headObject({ key }) {
          if (key === objectKey) {
            return { exists: true, size: 1000, contentType: "audio/mpeg" };
          }
          return { exists: false, size: null, contentType: null };
        },
      },
      countPlatformMasterAssets: async () => 0,
      listOrphanStorageKeys: async () => [],
    };
  }

  it("forces DRY_RUN, zero mutations, writes archive", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "far01-prod-"));
    tempDirs.push(dir);
    const out = path.join(dir, "out.json");
    const result = await runFar01ProdDryRun({
      operatorId: "owner-test",
      gitSha: "f9500b3",
      outputPath: out,
      ports: injectedPorts(),
      env: {
        [FAR01_DRYRUN_ENV.url]: "https://example.supabase.co",
        [FAR01_DRYRUN_ENV.key]: "readonly-key",
        [FAR01_DRYRUN_ENV.credentialClass]: "readonly",
      },
    });
    expect(result.archive.mode).toBe("DRY_RUN");
    expect(result.archive.live_mutations_attempted).toBe(0);
    expect(result.archivePath).toBe(path.resolve(out));
  });

  it("rejects LIVE request", async () => {
    await expect(
      runFar01ProdDryRun({
        operatorId: "op",
        gitSha: "sha",
        liveRequested: true,
        skipWrite: true,
        ports: injectedPorts(),
      }),
    ).rejects.toThrow(/LIVE_REFUSED/);
  });

  it("requires operator-id and git-sha", async () => {
    await expect(
      runFar01ProdDryRun({
        operatorId: "",
        gitSha: "sha",
        skipWrite: true,
        ports: injectedPorts(),
      }),
    ).rejects.toThrow(/operator_id/);
  });

  it("fail closed without credentials when ports omitted", async () => {
    await expect(
      runFar01ProdDryRun({
        operatorId: "op",
        gitSha: "sha",
        skipWrite: true,
        env: {},
      }),
    ).rejects.toThrow(Far01CredentialGateError);
  });

  it("fail closed on partial inventory read failure", async () => {
    await expect(
      runFar01ProdDryRun({
        operatorId: "op",
        gitSha: "sha",
        skipWrite: true,
        ports: {
          ...injectedPorts(),
          countPlatformMasterAssets: async () => {
            throw new Error("db timeout");
          },
        },
      }),
    ).rejects.toThrow(/Partial read failure/);
  });
});

describe("security: PATH ≠ AUTH / arbitrary keys", () => {
  it("does not treat client path as authority in inventory mapping", async () => {
    const foreignOwner = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const foreignKey = buildLegacyUserBeatMasterObjectKey({
      ownerId: foreignOwner,
      beatId: BEAT,
      assetId: ASSET,
    });
    const result = await refreshFar01Inventory({
      db: {
        async listUserMasterAssets() {
          return [
            {
              asset: asset({ object_key: foreignKey }),
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
          if (key === foreignKey) {
            return { exists: true, size: 1000, contentType: "audio/mpeg" };
          }
          return { exists: false, size: null, contentType: null };
        },
      },
      countPlatformMasterAssets: async () => 0,
      listOrphanStorageKeys: async () => [],
    });
    expect(result.assets[0]!.identity_anomaly).toBe(true);
    expect(result.assets[0]!.action).toBe("QUARANTINE");
    expect(result.assets[0]!.expected_canonical_key).toBe(canonicalKey());
  });
});
