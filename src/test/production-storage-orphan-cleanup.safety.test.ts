/**
 * P0 + P0.2 + P0.3 (R1) + R2 import isolation + R3.1 local safety tests.
 * Helpers + executeWithDeps / executeDeletePhaseWithDeps with mocks only.
 * Never creates a real Supabase client or reads production inventory.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { completeInventoryFixture } from "../../scripts/orphan-cleanup/inventory-contract";
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
  type OrphanBatchRemoveReport,
  type OrphanCleanupDeps,
} from "../../scripts/production-storage-orphan-cleanup";

function invDoc(objects: InventoryObject[]) {
  return completeInventoryFixture(objects);
}

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
    getInventoryDocument: () => invDoc([]),
    getDeletedBeatIds: () => [],
    loadClassifyContext: async () => ({
      ...emptyCtx(),
      platformLiveAssetCount: 0,
      db_read_complete: true,
      count_complete: true,
      pages_consistent: true,
      snapshot_consistent: false as const,
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

describe("orphan cleanup R2 import isolation", () => {
  it("dynamic import does not call createClient", async () => {
    // Fresh module graph so this assertion is not satisfied by a prior cache hit.
    vi.resetModules();
    const createClientMock = vi.fn(() => {
      throw new Error(
        "createClient must not run during orphan-cleanup module import",
      );
    });
    // Registered before dynamic imports below (doMock is not hoisted).
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: createClientMock,
    }));

    // Prove the mock is the active binding before evaluating the cleanup module.
    const supabase = await import("@supabase/supabase-js");
    expect(supabase.createClient).toBe(createClientMock);
    expect(createClientMock).toHaveBeenCalledTimes(0);

    const mod = await import("../../scripts/production-storage-orphan-cleanup");

    expect(createClientMock).toHaveBeenCalledTimes(0);
    expect(typeof mod.executeWithDeps).toBe("function");
    // Do not call main / createProductionDeps / execute / classify — import only.
  });
});

describe("orphan cleanup P0.2 executeWithDeps integration", () => {
  it("T1a: catalog with metadata — executeWithDeps → remove calls = 0", async () => {
    const inv: InventoryObject[] = [
      { object_path: CATALOG_KEY, size_bytes: 16044, created_at: null },
    ];
    const { deps, removeCalls } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      loadClassifyContext: async () => ({
        ...emptyCtx({ assetKeys: new Set([CATALOG_KEY]) }),
        platformLiveAssetCount: 0,
        db_read_complete: true,
        count_complete: true,
        pages_consistent: true,
        snapshot_consistent: false as const,
      }),
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
    expect(result.deleted).toBe(0);
  });

  it("T1b: catalog without metadata — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventoryDocument: () =>
        invDoc([
          { object_path: CATALOG_KEY, size_bytes: null, created_at: null },
        ]),
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
  });

  it("T2: platform only — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventoryDocument: () =>
        invDoc([
          { object_path: PLATFORM_KEY, size_bytes: 100, created_at: null },
        ]),
    });
    const result = await executeWithDeps(deps);
    expect(result.rows[0]?.classification).toBe("KEEP");
    expect(removeCalls).toHaveLength(0);
  });

  it("T3: unknown prefix — executeWithDeps → remove calls = 0", async () => {
    const { deps, removeCalls } = baseMockDeps({
      getInventoryDocument: () =>
        invDoc([
          { object_path: UNKNOWN_KEY, size_bytes: 16044, created_at: null },
        ]),
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
      getInventoryDocument: () => invDoc(inv),
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
      getInventoryDocument: () =>
        invDoc([
          { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
        ]),
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
      getInventoryDocument: () =>
        invDoc([
          { object_path: USER_ORPHAN, size_bytes: 16044, created_at: null },
        ]),
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

describe("orphan cleanup R3.1 batch evidence + fail-stop", () => {
  it("R3.1a: batch1 OK then batch2 ERROR — two removes, no batch3, not PASS", async () => {
    const inv: InventoryObject[] = [0, 1, 2].map((n) => ({
      object_path: userOrphanKey(n),
      size_bytes: 16044,
      created_at: null,
    }));
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const batchReports: OrphanBatchRemoveReport[] = [];
    let evidence: Record<string, unknown> | null = null;
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
      onBatchReport: (r) => batchReports.push(r),
      onEvidence: (e) => {
        evidence = e;
      },
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        if (removeCalls.length === 1) return { error: null };
        return { error: { message: "mock batch2 failure" } };
      },
    });

    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    expect(removeCalls).toHaveLength(2);
    expect(batchReports).toHaveLength(2);
    expect(batchReports[0]?.status).toBe("OK");
    expect(batchReports[0]?.batch_index).toBe(1);
    expect(batchReports[1]?.status).toBe("ERROR");
    expect(batchReports[1]?.batch_index).toBe(2);
    expect(evidence?.outcome).toBe("FAIL_STOP");
    expect(evidence?.orphan_cleanup_pass).toBe(false);
    expect(evidence?.claimed_ok_path_count).toBe(1);
  });

  it("R3.1b: batch1 OK then batch2 throw — AMBIGUOUS, not PASS, no further batches", async () => {
    const inv: InventoryObject[] = [0, 1, 2].map((n) => ({
      object_path: userOrphanKey(n),
      size_bytes: 16044,
      created_at: null,
    }));
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const batchReports: OrphanBatchRemoveReport[] = [];
    let evidence: Record<string, unknown> | null = null;
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
      onBatchReport: (r) => batchReports.push(r),
      onEvidence: (e) => {
        evidence = e;
      },
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        if (removeCalls.length === 1) return { error: null };
        throw new Error("mock network throw");
      },
    });

    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    expect(removeCalls).toHaveLength(2);
    expect(batchReports[0]?.status).toBe("OK");
    expect(batchReports[1]?.status).toBe("AMBIGUOUS");
    expect(batchReports[1]?.storage_state_independently_verified).toBe(false);
    expect(evidence?.outcome).toBe("FAIL_STOP");
    expect(evidence?.orphan_cleanup_pass).toBe(false);
  });

  it("R3.1c: first batch ERROR — no second batch, not PASS", async () => {
    const inv: InventoryObject[] = [0, 1].map((n) => ({
      object_path: userOrphanKey(n),
      size_bytes: 16044,
      created_at: null,
    }));
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const batchReports: OrphanBatchRemoveReport[] = [];
    let evidence: Record<string, unknown> | null = null;
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
      onBatchReport: (r) => batchReports.push(r),
      onEvidence: (e) => {
        evidence = e;
      },
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: { message: "first batch failed" } };
      },
    });

    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    expect(removeCalls).toHaveLength(1);
    expect(batchReports).toHaveLength(1);
    expect(batchReports[0]?.status).toBe("ERROR");
    expect(evidence?.outcome).toBe("FAIL_STOP");
    expect(evidence?.orphan_cleanup_pass).toBe(false);
    expect(evidence?.claimed_ok_path_count).toBe(0);
  });

  it("R3.1d: all batches OK — PASS evidence retained", async () => {
    const inv: InventoryObject[] = [0, 1].map((n) => ({
      object_path: userOrphanKey(n),
      size_bytes: 16044,
      created_at: null,
    }));
    const batchReports: OrphanBatchRemoveReport[] = [];
    let evidence: Record<string, unknown> | null = null;
    const { deps, removeCalls } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
      onBatchReport: (r) => batchReports.push(r),
      onEvidence: (e) => {
        evidence = e;
      },
    });

    const result = await executeWithDeps(deps);
    expect(result.deleted).toBe(2);
    expect(removeCalls).toHaveLength(2);
    expect(batchReports.every((b) => b.status === "OK")).toBe(true);
    expect(evidence?.outcome).toBe("PASS");
    expect(evidence?.orphan_cleanup_pass).toBe(true);
    expect(Array.isArray(evidence?.batches)).toBe(true);
  });

  it("R3.1e: unsafe batch still blocks storageRemove (R1 preserved)", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const batchReports: OrphanBatchRemoveReport[] = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
      onBatchReport: (r) => batchReports.push(r),
    });
    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(CATALOG_KEY, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
    expect(batchReports).toHaveLength(0);
  });
});

describe("P1 log redaction (execute stdout)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureConsole(): { logs: string[] } {
    const logs: string[] = [];
    const push = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    vi.spyOn(console, "log").mockImplementation(push);
    vi.spyOn(console, "error").mockImplementation(push);
    return { logs };
  }

  function assertNoRawControlPaths(blob: string, paths: string[]) {
    for (const p of paths) {
      expect(blob.includes(p), `stdout leaked path: ${p}`).toBe(false);
    }
    expect(blob.includes('"paths"')).toBe(false);
    expect(blob.includes("object_path")).toBe(false);
  }

  it("PASS orphan_batch + evidence stdout omit raw paths", async () => {
    const { logs } = captureConsole();
    const control = [userOrphanKey(0), userOrphanKey(1)];
    const inv: InventoryObject[] = control.map((object_path) => ({
      object_path,
      size_bytes: 16044,
      created_at: null,
    }));
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
    });
    await executeWithDeps(deps);
    const blob = logs.join("\n");
    assertNoRawControlPaths(blob, control);
    expect(blob.includes("orphan_batch")).toBe(true);
    expect(blob.includes("ORPHAN CLEANUP PASS")).toBe(true);
    expect(blob.includes("path_digest_prefixes")).toBe(true);
  });

  it("FAIL_STOP ERROR stdout omits raw paths and provider error body", async () => {
    const { logs } = captureConsole();
    const control = [userOrphanKey(0), userOrphanKey(1)];
    const inv: InventoryObject[] = control.map((object_path) => ({
      object_path,
      size_bytes: 16044,
      created_at: null,
    }));
    const leakyProviderMsg = `Storage remove failed for ${control[0]}`;
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      batchSize: 1,
      storageRemove: async () => ({
        error: { message: leakyProviderMsg },
      }),
    });
    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    const blob = logs.join("\n");
    assertNoRawControlPaths(blob, control);
    expect(blob.includes(leakyProviderMsg)).toBe(false);
    expect(blob.includes("ORPHAN CLEANUP FAIL_STOP")).toBe(true);
    expect(blob.includes("orphan_batch")).toBe(true);
  });

  it("FAIL_STOP AMBIGUOUS throw stdout omits raw paths", async () => {
    const { logs } = captureConsole();
    const control = [userOrphanKey(0)];
    const inv: InventoryObject[] = [
      { object_path: control[0]!, size_bytes: 16044, created_at: null },
    ];
    const { deps } = baseMockDeps({
      getInventoryDocument: () => invDoc(inv),
      storageRemove: async () => {
        throw new Error(`network boom at ${control[0]}`);
      },
    });
    await expect(executeWithDeps(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
    const blob = logs.join("\n");
    assertNoRawControlPaths(blob, control);
    expect(blob.includes("ORPHAN CLEANUP FAIL_STOP")).toBe(true);
  });

  it("reclassify abort message and stdout omit raw paths", async () => {
    const { logs } = captureConsole();
    const { deps } = baseMockDeps();
    let thrown: unknown;
    try {
      await executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(CATALOG_KEY, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(OrphanCleanupAbortError);
    const msg = thrown instanceof Error ? thrown.message : String(thrown);
    expect(msg.includes(CATALOG_KEY)).toBe(false);
    expect(msg.includes("path_digest=")).toBe(true);
    assertNoRawControlPaths(logs.join("\n"), [
      CATALOG_KEY,
      PLATFORM_KEY,
      USER_ORPHAN,
    ]);
  });

  it("assertKeySafeToRemove errors use digests not raw paths", () => {
    expect(() =>
      assertKeySafeToRemove({
        bucket: BEAT_AUDIO_ORPHAN_BUCKET,
        objectPath: CATALOG_KEY,
        classification: "SAFE_DELETE",
      }),
    ).toThrow(/path_digest=/);
    try {
      assertKeySafeToRemove({
        bucket: BEAT_AUDIO_ORPHAN_BUCKET,
        objectPath: CATALOG_KEY,
        classification: "SAFE_DELETE",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      expect(msg.includes(CATALOG_KEY)).toBe(false);
    }
  });
});

describe("P1 delete completeness guard", () => {
  it("forged SAFE_DELETE with count_complete=false never calls storageRemove", async () => {
    const removeCalls: Array<{ bucket: string; paths: string[] }> = [];
    const { deps } = baseMockDeps({
      storageRemove: async (bucket, paths) => {
        removeCalls.push({ bucket, paths: [...paths] });
        return { error: null };
      },
      loadClassifyContext: async () => ({
        ...emptyCtx(),
        platformLiveAssetCount: 0,
        db_read_complete: true,
        count_complete: false,
        pages_consistent: true,
        snapshot_consistent: false,
      }),
    });
    await expect(
      executeDeletePhaseWithDeps(
        deps,
        [forgeSafeDelete(USER_ORPHAN, 16044)],
        { SAFE_DELETE: 1, KEEP: 0, UNKNOWN: 0 },
      ),
    ).rejects.toBeInstanceOf(OrphanCleanupAbortError);
    expect(removeCalls).toHaveLength(0);
  });
});
