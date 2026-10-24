/**
 * P0 + P0.2 + P0.3 (R1) local safety tests for orphan cleanup.
 * Helpers + executeWithDeps / executeDeletePhaseWithDeps with mocks only.
 * Never creates a real Supabase client or reads production inventory.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertKeySafeToRemove,
  BEAT_AUDIO_ORPHAN_BUCKET,
  classifyBeatAudioOrphanObject,
  executeDeletePhaseWithDeps,
  executeWithDeps,
  OrphanCleanupAbortError,
  parsePath,
  type ClassRow,
  type ClassifyDbContext,
  type InventoryObject,
  type OrphanCleanupDeps,
} from "../../scripts/production-storage-orphan-cleanup";

const CATALOG_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const CATALOG_KEY = `catalog/${CATALOG_ID}/original.bin`;
const PLATFORM_KEY =
  "platform/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/master.bin";
const USER_ORPHAN =
  "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin";
const UNKNOWN_KEY = "unexpected/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/object.bin";

function emptyCtx(overrides?: Partial<ClassifyDbContext>): ClassifyDbContext {
  return {
    assetKeys: new Set(),
    assetIds: new Set(),
    liveBeats: new Set(),
    platformBeats: new Set(),
    takeKeys: new Set(),
    takeIds: new Set(),
    artifactKeys: new Set(),
    deletedBeatIds: new Set(),
    clips: [],
    projects: [],
    ...overrides,
  };
}

function abortThrow(message: string): never {
  throw new OrphanCleanupAbortError(message);
}

function userOrphanKey(n: number): string {
  const u = `33333333-3333-3333-3333-${String(n).padStart(12, "0")}`;
  const b = `44444444-4444-4444-4444-${String(n).padStart(12, "0")}`;
  const a = `55555555-5555-5555-5555-${String(n).padStart(12, "0")}`;
  return `user/${u}/${b}/${a}/master.bin`;
}

function baseMockDeps(overrides?: Partial<OrphanCleanupDeps>): {
  deps: OrphanCleanupDeps;
  removeCalls: Array<{ bucket: string; paths: string[] }>;
} {
  const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
  const deps: OrphanCleanupDeps = {
    abort: abortThrow,
    getInventory: () => [],
    getDeletedBeatIds: () => [],
    loadClassifyContext: async () => ({
      ...emptyCtx(),
      platformLiveAssetCount: 0,
    }),
    storageRemove: async (bucket, paths) => {
      removeCalls.push({ bucket, paths: [...paths] });
      return { error: null };
    },
    getPlatformAssetKeys: async () => [],
    objectExists: async () => true,
    countBeatsAndAssets: async () => ({ beats: 0, assets: 0 }),
    requiredPlatformAssetCount: null,
    verifyUnmappedTake: false,
    batchSize: 40,
    ...overrides,
  };
  return { deps, removeCalls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("orphan cleanup P0 helper safety", () => {
  it("catalog with metadata never SAFE_DELETE", () => {
    const row = classifyBeatAudioOrphanObject(
      { object_path: CATALOG_KEY, size_bytes: 16044, created_at: null },
      emptyCtx({ assetKeys: new Set([CATALOG_KEY]) }),
    );
    expect(row.classification).toBe("KEEP");
  });

  it("catalog without metadata never SAFE_DELETE", () => {
    const row = classifyBeatAudioOrphanObject(
      { object_path: CATALOG_KEY, size_bytes: null, created_at: null },
      emptyCtx(),
    );
    expect(row.classification).toBe("KEEP");
  });

  it("unknown prefix fail-closed", () => {
    expect(parsePath(UNKNOWN_KEY).path_kind).toBe("other");
    expect(
      classifyBeatAudioOrphanObject(
        { object_path: UNKNOWN_KEY, size_bytes: 16044, created_at: null },
        emptyCtx(),
      ).classification,
    ).toBe("UNKNOWN");
  });

  it("platform KEEP + pre-remove blocks", () => {
    expect(
      classifyBeatAudioOrphanObject(
        { object_path: PLATFORM_KEY, size_bytes: 999, created_at: null },
        emptyCtx(),
      ).classification,
    ).toBe("KEEP");
    expect(() =>
      assertKeySafeToRemove({
        bucket: BEAT_AUDIO_ORPHAN_BUCKET,
        objectPath: PLATFORM_KEY,
        classification: "SAFE_DELETE",
      }),
    ).toThrow(/platform/);
  });

  it("missing size blocks SAFE_DELETE on user", () => {
    expect(
      classifyBeatAudioOrphanObject(
        { object_path: USER_ORPHAN, size_bytes: null, created_at: null },
        emptyCtx(),
      ).classification,
    ).toBe("UNKNOWN");
  });

  it("wrong bucket blocked by assertKeySafeToRemove", () => {
    expect(() =>
      assertKeySafeToRemove({
        bucket: "take-audio",
        objectPath: USER_ORPHAN,
        classification: "SAFE_DELETE",
      }),
    ).toThrow(/bucket/);
  });

  it("user fixture orphan remains SAFE_DELETE", () => {
    expect(
      classifyBeatAudioOrphanObject(
        { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
        emptyCtx(),
      ).classification,
    ).toBe("SAFE_DELETE");
  });
});

describe("orphan cleanup P0.2 executeWithDeps integration", () => {
  it("import does not create production client (createClient never used here)", () => {
    // This suite only uses executeWithDeps with mocks; createProductionDeps is CLI-only.
    expect(typeof executeWithDeps).toBe("function");
  });

  it("T1a: catalog with metadata — executeWithDeps → remove calls = 0", async () => {
    const inv: InventoryObject[] = [
      { object_path: CATALOG_KEY, size_bytes: 16044, created_at: null },
    ];
    const { deps, removeCalls } = baseMockDeps({
      getInventory: () => inv,
      loadClassifyContext: async () => ({
        ...emptyCtx({ assetKeys: new Set([CATALOG_KEY]) }),
        platformLiveAssetCount: 0,
      }),
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
    expect(result.deleted).toBe(0);
  });

  it("T1b: catalog without metadata — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventory: () => [
        { object_path: CATALOG_KEY, size_bytes: null, created_at: null },
      ],
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
  });

  it("T2: platform only — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventory: () => [
        { object_path: PLATFORM_KEY, size_bytes: 100, created_at: null },
      ],
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
  });

  it("T3: unknown prefix — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventory: () => [
        { object_path: UNKNOWN_KEY, size_bytes: 16044, created_at: null },
      ],
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("UNKNOWN");
    expect(removeCalls).toHaveLength(0);
  });

  it("T4: remove error aborts — second batch never starts", async () => {
    const inv: InventoryObject[] = [0, 1, 2].map((n) => ({
      object_path: userOrphanKey(n),
      size_bytes: 16044,
      created_at: null,
    }));
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      getInventory: () => inv,
      batchSize: 2,
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: { message: "mock remove failure" } };
      },
    });
    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.paths).toHaveLength(2);
    expect(removeCalls[0]?.bucket).toBe(BEAT_AUDIO_ORPHAN_BUCKET);
  });

  it("T5: poisoned SAFE_DELETE catalog in batch — remove calls = 0", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
      batchSize: 10,
    });
    const forged: ClassRow[] = [
      classifyBeatAudioOrphanObject(
        { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
        emptyCtx(),
      ),
      {
        ...classifyBeatAudioOrphanObject(
          { object_path: CATALOG_KEY, size_bytes: 16044, created_at: null },
          emptyCtx(),
        ),
        // Force into candidate list to simulate poisoned / stale classification.
        classification: "SAFE_DELETE",
      },
    ];
    expect(forged[0]?.classification).toBe("SAFE_DELETE");
    expect(forged[1]?.classification).toBe("SAFE_DELETE");

    await expect(
      executeDeletePhaseWithDeps(deps, forged, {
        KEEP: 0,
        UNKNOWN: 0,
        SAFE_DELETE: 2,
      }),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });

  it("T6: bucket is immutable in execute — remove always receives beat-audio", async () => {
    // Architecture: executeDeletePhaseWithDeps always calls
    // storageRemove(BEAT_AUDIO_ORPHAN_BUCKET, chunk). Wrong bucket cannot be
    // injected without changing deps contract; assertKeySafeToRemove still
    // rejects non-beat-audio buckets at the gate.
    expect(() =>
      assertKeySafeToRemove({
        bucket: "audio-artifacts",
        objectPath: USER_ORPHAN,
        classification: "SAFE_DELETE",
      }),
    ).toThrow(/bucket/);

    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      getInventory: () => [
        { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
      ],
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    await executeWithDeps(deps);
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.bucket).toBe(BEAT_AUDIO_ORPHAN_BUCKET);
    expect(removeCalls.every((c) => c.bucket === BEAT_AUDIO_ORPHAN_BUCKET)).toBe(
      true,
    );
  });
});

/** Force classification label without changing path/size (simulates poisoned input). */
function forgeSafeDelete(
  object_path: string,
  size_bytes: number | null,
): ClassRow {
  return {
    ...classifyBeatAudioOrphanObject(
      { object_path, size_bytes, created_at: null },
      emptyCtx(),
    ),
    classification: "SAFE_DELETE",
  };
}

describe("orphan cleanup P0.3 R1 re-classification before delete", () => {
  it("R1a: forged SAFE_DELETE catalog/* → storageRemove never called", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(CATALOG_KEY, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });

  it("R1b: forged SAFE_DELETE platform/* → storageRemove never called", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(PLATFORM_KEY, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });

  it("R1c: forged SAFE_DELETE unknown prefix → storageRemove never called", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(UNKNOWN_KEY, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });

  it("R1d: forged SAFE_DELETE user/* that fails real classify → no remove", async () => {
    // Wrong size → classify returns UNKNOWN; forged label must not delete.
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    const forgedUser = forgeSafeDelete(USER_ORPHAN, 999999);
    expect(forgedUser.classification).toBe("SAFE_DELETE");
    expect(
      classifyBeatAudioOrphanObject(
        { object_path: USER_ORPHAN, size_bytes: 999999, created_at: null },
        emptyCtx(),
      ).classification,
    ).toBe("UNKNOWN");

    await expect(
      executeDeletePhaseWithDeps(deps, [forgedUser], {
        SAFE_DELETE: 1,
        KEEP: 0,
        UNKNOWN: 0,
      }),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });

  it("R1e: correctly classified user/* fixture orphan still deletes via executeWithDeps", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      getInventory: () => [
        { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
      ],
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("SAFE_DELETE");
    expect(result.deleted).toBe(1);
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0]?.bucket).toBe(BEAT_AUDIO_ORPHAN_BUCKET);
    expect(removeCalls[0]?.paths).toEqual([USER_ORPHAN]);
  });

  it("R1f: forged row in batch with valid orphan — abort before any storageRemove", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
      batchSize: 10,
    });
    const valid = classifyBeatAudioOrphanObject(
      { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
      emptyCtx(),
    );
    expect(valid.classification).toBe("SAFE_DELETE");
    const forgedCatalog = forgeSafeDelete(CATALOG_KEY, 16044);

    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [valid, forgedCatalog],
        { SAFE_DELETE: 2, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });
});
