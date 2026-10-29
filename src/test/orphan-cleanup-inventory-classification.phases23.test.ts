/**
 * Phases 2–3: inventory wire-format, exporter, DB completeness, redacted report.
 * Mocks/fixtures only — no production Storage/DB/CLI.
 */
import { describe, expect, it } from "vitest";
import {
  fetchCompleteTable,
  fetchAllClassifySetsComplete,
} from "../../scripts/orphan-cleanup/db-completeness";
import {
  assertInventoryAcceptableForFinalClassify,
  buildInventoryDocument,
  completeInventoryFixture,
  computeKeySetDigest,
  inventorySummaryForLog,
  parseAndAssertInventoryForFinalClassify,
  pathDigestPrefix,
  validateOrphanInventoryDocument,
  type OrphanInventoryObject,
} from "../../scripts/orphan-cleanup/inventory-contract";
import {
  exportBeatAudioInventory,
  REQUIRED_INVENTORY_SORT_BY,
  type InventoryListItem,
} from "../../scripts/orphan-cleanup/inventory-exporter";
import {
  assertNoSensitiveFieldsInReport,
  buildRedactedClassifyReport,
  suppressSafeDeleteIfIncomplete,
} from "../../scripts/orphan-cleanup/redacted-report";
import {
  classifyWithDepsAsync,
  executeWithDeps,
  OrphanCleanupAbortError,
  parseCliInventorySource,
  parseDeletedBeatAllowlist,
  type OrphanCleanupDeps,
} from "../../scripts/production-storage-orphan-cleanup";

function abortThrow(message: string): never {
  throw new OrphanCleanupAbortError(message);
}

const FIXTURE = new Set([16044, 2646044]);

function pageOk(items: InventoryListItem[]) {
  return { items, sortByApplied: REQUIRED_INVENTORY_SORT_BY };
}

function getRowId(row: { id?: string }): string | null {
  return typeof row.id === "string" ? row.id : null;
}

function completeDbFlags(dbComplete: boolean) {
  return {
    db_read_complete: dbComplete,
    count_complete: dbComplete,
    pages_consistent: dbComplete,
    snapshot_consistent: false as const,
  };
}

describe("orphan inventory contract (phase 2)", () => {
  it("accepts complete fixture document", () => {
    const doc = completeInventoryFixture([
      {
        object_path: "user/a/b/c/master.bin",
        size_bytes: 16044,
        created_at: null,
      },
    ]);
    const v = validateOrphanInventoryDocument(doc);
    expect(v.ok).toBe(true);
    expect(() => assertInventoryAcceptableForFinalClassify(doc)).not.toThrow();
  });

  it("rejects unsupported schema_version", () => {
    const doc = completeInventoryFixture([]);
    const raw = { ...doc, schema_version: "orphan-inv-v0" };
    const v = validateOrphanInventoryDocument(raw);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.some((e) => e.code === "unsupported_schema")).toBe(true);
    }
  });

  it("rejects incomplete/failed/in_progress for final classify", () => {
    for (const listing_status of [
      "incomplete",
      "failed",
      "in_progress",
    ] as const) {
      const doc = buildInventoryDocument({
        environmentId: "test",
        listingStatus: listing_status,
        listingStartedAt: "2026-10-25T00:00:00.000Z",
        listingFinishedAt: "2026-10-25T00:00:01.000Z",
        pageSize: 10,
        pagesCompleted: 1,
        paginationMechanism: "test",
        endCondition: listing_status === "complete" ? "done" : null,
        objects: [],
        diagnosticOnly: listing_status !== "complete",
      });
      expect(() => assertInventoryAcceptableForFinalClassify(doc)).toThrow(
        /rejected/,
      );
    }
  });

  it("rejects digest mismatch", () => {
    const doc = completeInventoryFixture([
      { object_path: "catalog/x/y.bin", size_bytes: 1, created_at: null },
    ]);
    const tampered = { ...doc, key_set_digest: "0".repeat(64) };
    const v = validateOrphanInventoryDocument(tampered);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.some((e) => e.code === "digest_mismatch")).toBe(true);
    }
  });

  it("summary log has no object paths", () => {
    const doc = completeInventoryFixture([
      {
        object_path: "user/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/b/a/master.bin",
        size_bytes: 16044,
        created_at: null,
      },
    ]);
    const summary = inventorySummaryForLog(doc);
    const blob = JSON.stringify(summary);
    expect(blob.includes("object_path")).toBe(false);
    expect(blob.includes("user/aaaaaaaa")).toBe(false);
    expect(summary.key_set_digest).toBe(doc.key_set_digest);
  });
});

describe("orphan inventory exporter (phase 2)", () => {
  it("paginates multiple pages to complete inventory", async () => {
    const pages: Record<string, number> = {};
    const sortArgs: unknown[] = [];
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 2,
      paginationMechanism:
        "mock limit+offset sortBy=name:asc; concurrent NOT VERIFIED",
      listPage: async ({ prefix, limit, offset, sortBy }) => {
        sortArgs.push(sortBy);
        if (prefix !== "") return pageOk([]);
        const all = ["a.bin", "b.bin", "c.bin", "d.bin"];
        pages[`${offset}`] = (pages[`${offset}`] ?? 0) + 1;
        const slice = all.slice(offset, offset + limit);
        return pageOk(
          slice.map((name) => ({
            name,
            isFolder: false,
            objectKey: name,
            sizeBytes: 16044,
            createdAt: null,
          })),
        );
      },
    });
    expect(result.acceptableForFinalClassify).toBe(true);
    expect(result.document.listing_status).toBe("complete");
    expect(result.document.objects_accumulated).toBe(4);
    expect(result.document.pages_completed).toBeGreaterThanOrEqual(2);
    expect(result.document.end_condition).toMatch(/stable_sortBy/);
    expect(sortArgs.every((s) => JSON.stringify(s) === JSON.stringify(REQUIRED_INVENTORY_SORT_BY))).toBe(
      true,
    );
    expect(result.summary).not.toHaveProperty("objects");
    expect(JSON.stringify(result.summary).includes("a.bin")).toBe(false);
  });

  it("mid-page error yields failed diagnostic — never complete", async () => {
    let calls = 0;
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 2,
      paginationMechanism: "mock",
      listPage: async ({ offset }) => {
        calls += 1;
        if (offset === 2) {
          return { items: [], error: "boom", sortByApplied: REQUIRED_INVENTORY_SORT_BY };
        }
        return pageOk([
          {
            name: `f${offset}.bin`,
            isFolder: false,
            objectKey: `f${offset}.bin`,
            sizeBytes: 1,
            createdAt: null,
          },
          {
            name: `f${offset + 1}.bin`,
            isFolder: false,
            objectKey: `f${offset + 1}.bin`,
            sizeBytes: 1,
            createdAt: null,
          },
        ]);
      },
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.acceptableForFinalClassify).toBe(false);
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.diagnostic_only).toBe(true);
    expect(() =>
      assertInventoryAcceptableForFinalClassify(result.document),
    ).toThrow();
  });

  it("aborted export is incomplete diagnostic", async () => {
    let n = 0;
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      shouldAbort: () => {
        n += 1;
        return n > 1;
      },
      listPage: async () =>
        pageOk([
          {
            name: "x.bin",
            isFolder: false,
            objectKey: "x.bin",
            sizeBytes: null,
            createdAt: null,
          },
        ]),
    });
    expect(result.document.listing_status).toBe("incomplete");
    expect(result.acceptableForFinalClassify).toBe(false);
  });

  it("P1: missing items is failed not EOF", async () => {
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      listPage: async () =>
        ({ sortByApplied: REQUIRED_INVENTORY_SORT_BY } as {
          items?: InventoryListItem[];
          sortByApplied: typeof REQUIRED_INVENTORY_SORT_BY;
        }),
    });
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/items_missing/);
    expect(result.acceptableForFinalClassify).toBe(false);
  });

  it("P1: bad record fails closed", async () => {
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      listPage: async () =>
        pageOk([{ name: "", isFolder: false, objectKey: "x" }]),
    });
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/bad_record/);
  });

  it("P1: duplicate key fails closed", async () => {
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      listPage: async () =>
        pageOk([
          {
            name: "a.bin",
            isFolder: false,
            objectKey: "same.bin",
            sizeBytes: 1,
            createdAt: null,
          },
          {
            name: "b.bin",
            isFolder: false,
            objectKey: "same.bin",
            sizeBytes: 1,
            createdAt: null,
          },
        ]),
    });
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/duplicate_key/);
  });

  it("P1: full page zero new keys fails closed", async () => {
    let calls = 0;
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 2,
      paginationMechanism: "mock",
      listPage: async ({ prefix }) => {
        calls += 1;
        if (prefix !== "") return pageOk([]);
        // Same full folder page every offset → second page adds no new prefixes.
        return pageOk([
          { name: "a", isFolder: true },
          { name: "b", isFolder: true },
        ]);
      },
    });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/full_page_zero_new_keys/);
  });

  it("P1: listPage throw yields failed diagnostic", async () => {
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      listPage: async () => {
        throw new Error("timeout");
      },
    });
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/listPage_throw/);
    expect(result.acceptableForFinalClassify).toBe(false);
  });

  it("P1: sortBy mismatch fails closed", async () => {
    const result = await exportBeatAudioInventory({
      environmentId: "test-local",
      pageSize: 10,
      paginationMechanism: "mock",
      listPage: async () => ({
        items: [],
        sortByApplied: { column: "name", order: "desc" } as unknown as typeof REQUIRED_INVENTORY_SORT_BY,
      }),
    });
    expect(result.document.listing_status).toBe("failed");
    expect(result.document.failure_reason).toMatch(/sortBy_mismatch/);
  });
});

describe("orphan DB completeness (phase 3)", () => {
  it("passes when pages match exact count", async () => {
    const rows = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const result = await fetchCompleteTable({
      setName: "beats",
      pageSize: 2,
      getRowId,
      fetchExactCount: async () => ({ count: 3 }),
      fetchPage: async (from, to) => ({
        rows: rows.slice(from, to + 1),
      }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fetched_row_count).toBe(3);
      expect(result.db_read_complete).toBe(true);
      expect(result.count_complete).toBe(true);
      expect(result.pages_consistent).toBe(true);
      expect(result.snapshot_consistent).toBe(false);
    }
  });

  it("fails on page error", async () => {
    const result = await fetchCompleteTable({
      setName: "takes",
      pageSize: 10,
      getRowId,
      fetchExactCount: async () => ({ count: 5 }),
      fetchPage: async () => ({ rows: [], error: "db down" }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.db_read_complete).toBe(false);
      expect(result.reason).toMatch(/page_error/);
    }
  });

  it("fails on count mismatch", async () => {
    const result = await fetchCompleteTable({
      setName: "beat_audio_assets",
      pageSize: 100,
      getRowId,
      fetchExactCount: async () => ({ count: 99 }),
      fetchPage: async () => ({ rows: [{ id: "a" }, { id: "b" }] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/count_mismatch/);
  });

  it("P1: duplicate PK across pages fails closed", async () => {
    const result = await fetchCompleteTable({
      setName: "beats",
      pageSize: 2,
      getRowId,
      fetchExactCount: async () => ({ count: 4 }),
      fetchPage: async (from) => {
        if (from === 0) return { rows: [{ id: "1" }, { id: "2" }] };
        return { rows: [{ id: "2" }, { id: "3" }] };
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/duplicate_pk/);
      expect(result.pages_consistent).toBe(false);
      expect(result.snapshot_consistent).toBe(false);
    }
  });

  it("P1: missing PK fails closed", async () => {
    const result = await fetchCompleteTable({
      setName: "takes",
      pageSize: 10,
      getRowId,
      fetchExactCount: async () => ({ count: 1 }),
      fetchPage: async () => ({ rows: [{ id: "" }] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/missing_pk/);
  });

  it("P1: count unavailable fails closed", async () => {
    const result = await fetchCompleteTable({
      setName: "studio_clips",
      pageSize: 10,
      getRowId,
      fetchExactCount: async () => ({ count: null }),
      fetchPage: async () => ({ rows: [] }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/count_unavailable/);
  });

  it("P1: count_complete without claiming snapshot", async () => {
    const rows = [{ id: "a" }];
    const result = await fetchCompleteTable({
      setName: "audio_artifacts",
      pageSize: 10,
      getRowId,
      fetchExactCount: async () => ({ count: 1 }),
      fetchPage: async () => ({ rows }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count_complete).toBe(true);
      expect(result.snapshot_consistent).toBe(false);
    }
  });

  it("multi-set incomplete blocks db_read_complete", async () => {
    const emptyOk = {
      fetchExactCount: async () => ({ count: 0 }),
      fetchPage: async () => ({ rows: [] as { id: string }[] }),
      getRowId,
    };
    const { report } = await fetchAllClassifySetsComplete<{
      beat_audio_assets: { id: string };
      beats: { id: string };
      takes: { id: string };
      studio_clips: { id: string };
      studio_projects: { id: string };
      audio_artifacts: { id: string };
    }>({
      pageSize: 50,
      fetchers: {
        beat_audio_assets: {
          fetchExactCount: async () => ({ count: 1 }),
          fetchPage: async () => ({ rows: [{ id: "1" }] }),
          getRowId,
        },
        beats: {
          fetchExactCount: async () => ({ count: null }),
          fetchPage: async () => ({ rows: [] }),
          getRowId,
        },
        takes: emptyOk,
        studio_clips: emptyOk,
        studio_projects: emptyOk,
        audio_artifacts: emptyOk,
      },
    });
    expect(report.db_read_complete).toBe(false);
    expect(report.snapshot_consistent).toBe(false);
  });
});

describe("redacted classify report (phase 3)", () => {
  it("omits raw paths and user UUID patterns", () => {
    const inventory = completeInventoryFixture([
      {
        object_path:
          "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin",
        size_bytes: 16044,
        created_at: null,
      },
      {
        object_path: "catalog/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/x.bin",
        size_bytes: null,
        created_at: null,
      },
    ]);
    const report = buildRedactedClassifyReport({
      classifiedAt: "2026-10-25T00:00:00.000Z",
      inventory,
      rows: [
        {
          object_path: inventory.objects[0]!.object_path,
          path_kind: "user",
          classification: "SAFE_DELETE",
          size_bytes: 16044,
        },
        {
          object_path: inventory.objects[1]!.object_path,
          path_kind: "catalog",
          classification: "KEEP",
          size_bytes: null,
        },
      ],
      inventoryComplete: true,
      dbReadComplete: true,
      countComplete: true,
      pagesConsistent: true,
      snapshotConsistent: false,
      actionableGatesPass: true,
      fixtureSizes: FIXTURE,
      integrityPass: true,
      integrityReasonCode: "ok",
      includeDigestSamples: true,
    });
    assertNoSensitiveFieldsInReport(
      report as unknown as Record<string, unknown>,
    );
    const blob = JSON.stringify(report);
    expect(blob.includes("object_path")).toBe(false);
    expect(/"paths"\s*:/.test(blob)).toBe(false);
    expect(blob.includes(inventory.objects[0]!.object_path)).toBe(false);
    expect(report.size_null_count).toBe(1);
    expect(report.summary.SAFE_DELETE).toBe(1);
    expect(report.snapshot_consistent).toBe(false);
    expect(report.actionable_gates_pass).toBe(true);
    expect(report.count_complete).toBe(true);
    expect(report.pages_consistent).toBe(true);
    expect(report.optional_digest_samples?.SAFE_DELETE[0]).toBe(
      pathDigestPrefix(inventory.objects[0]!.object_path, 12),
    );
  });

  it("P0: redacted report does not overclaim snapshot via db_read_complete alone", () => {
    const inventory = completeInventoryFixture([
      {
        object_path:
          "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin",
        size_bytes: 16044,
        created_at: null,
      },
    ]);
    const report = buildRedactedClassifyReport({
      classifiedAt: "2026-10-25T00:00:00.000Z",
      inventory,
      rows: [
        {
          object_path: inventory.objects[0]!.object_path,
          path_kind: "user",
          classification: "UNKNOWN",
          size_bytes: 16044,
        },
      ],
      inventoryComplete: true,
      dbReadComplete: true,
      countComplete: true,
      pagesConsistent: true,
      snapshotConsistent: false,
      actionableGatesPass: true,
      fixtureSizes: FIXTURE,
      integrityPass: true,
      integrityReasonCode: "ok",
    });
    expect(report.db_read_complete).toBe(true);
    expect(report.snapshot_consistent).toBe(false);
    expect(report.actionable_gates_pass).toBe(true);
  });

  it("P0: actionable_gates_pass=false marks integrity fail", () => {
    const inventory = completeInventoryFixture([]);
    const report = buildRedactedClassifyReport({
      classifiedAt: "2026-10-25T00:00:00.000Z",
      inventory,
      rows: [],
      inventoryComplete: true,
      dbReadComplete: true,
      countComplete: false,
      pagesConsistent: true,
      snapshotConsistent: false,
      actionableGatesPass: false,
      fixtureSizes: FIXTURE,
      integrityPass: false,
      integrityReasonCode: "incomplete_flags",
    });
    expect(report.actionable_gates_pass).toBe(false);
    expect(report.snapshot_consistent).toBe(false);
    expect(report.integrity.result).toBe("fail");
    expect(report.integrity.reason_code).toMatch(/incomplete_flags/);
  });

  it("default classify onClassification report omits object_path and paths arrays", async () => {
    const controlPath =
      "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin";
    let captured: unknown = null;
    const deps: OrphanCleanupDeps = {
      abort: abortThrow,
      getInventoryDocument: () =>
        completeInventoryFixture([
          { object_path: controlPath, size_bytes: 16044, created_at: null },
        ]),
      getDeletedBeatIds: () => [],
      loadClassifyContext: async () => ({
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
        platformLiveAssetCount: 0,
        ...completeDbFlags(true),
      }),
      storageRemove: async () => ({ error: null }),
      getPlatformAssetKeys: async () => [],
      objectExists: async () => true,
      countBeatsAndAssets: async () => ({ beats: 0, assets: 0 }),
      requiredPlatformAssetCount: null,
      verifyUnmappedTake: false,
      onClassification: ({ redacted_report }) => {
        captured = redacted_report;
      },
    };
    await classifyWithDepsAsync(deps);
    expect(captured).not.toBeNull();
    const blob = JSON.stringify(captured);
    expect(blob.includes("object_path")).toBe(false);
    expect(/"paths"\s*:/.test(blob)).toBe(false);
    expect(blob.includes(controlPath)).toBe(false);
    assertNoSensitiveFieldsInReport(
      captured as Record<string, unknown>,
    );
  });

  it("suppresses SAFE_DELETE when db incomplete", () => {
    const rows = [
      { classification: "SAFE_DELETE" as const },
      { classification: "KEEP" as const },
    ];
    const out = suppressSafeDeleteIfIncomplete(rows, true, false);
    expect(out[0]?.classification).toBe("UNKNOWN");
    expect(out[1]?.classification).toBe("KEEP");
  });
});

describe("classify integration fail-closed (phase 3)", () => {
  function depsFor(
    objects: OrphanInventoryObject[],
    dbComplete: boolean,
  ): OrphanCleanupDeps {
    return {
      abort: abortThrow,
      getInventoryDocument: () => completeInventoryFixture(objects),
      getDeletedBeatIds: () => [],
      loadClassifyContext: async () => ({
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
        platformLiveAssetCount: 0,
        ...completeDbFlags(dbComplete),
      }),
      storageRemove: async () => ({ error: null }),
      getPlatformAssetKeys: async () => [],
      objectExists: async () => true,
      countBeatsAndAssets: async () => ({ beats: 0, assets: 0 }),
      requiredPlatformAssetCount: null,
      verifyUnmappedTake: false,
    };
  }

  it("aborts on bad inventory status", async () => {
    const bad = buildInventoryDocument({
      environmentId: "t",
      listingStatus: "failed",
      listingStartedAt: "2026-10-25T00:00:00.000Z",
      listingFinishedAt: "2026-10-25T00:00:01.000Z",
      pageSize: 10,
      pagesCompleted: 0,
      paginationMechanism: "t",
      endCondition: null,
      objects: [],
      diagnosticOnly: true,
      failureReason: "x",
    });
    const deps = depsFor([], true);
    deps.getInventoryDocument = () => bad;
    await expect(classifyWithDepsAsync(deps)).rejects.toBeInstanceOf(
      OrphanCleanupAbortError,
    );
  });

  it("forces SAFE_DELETE to UNKNOWN when db_read_complete=false", async () => {
    const user =
      "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin";
    const result = await classifyWithDepsAsync(
      depsFor([{ object_path: user, size_bytes: 16044, created_at: null }], false),
    );
    expect(result.db_read_complete).toBe(false);
    expect(result.rows[0]?.classification).toBe("UNKNOWN");
    expect(result.summary.SAFE_DELETE).toBe(0);
    assertNoSensitiveFieldsInReport(
      result.redacted_report as unknown as Record<string, unknown>,
    );
  });

  it("keeps catalog/platform protected under incomplete DB", async () => {
    const result = await classifyWithDepsAsync(
      depsFor(
        [
          {
            object_path: "catalog/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/o.bin",
            size_bytes: 1,
            created_at: null,
          },
          {
            object_path:
              "platform/11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/m.bin",
            size_bytes: 1,
            created_at: null,
          },
        ],
        false,
      ),
    );
    expect(result.rows.every((r) => r.classification === "KEEP")).toBe(true);
  });

  it("rejects invalid allowlist", () => {
    expect(() => parseDeletedBeatAllowlist({})).toThrow(/allowlist rejected/);
    expect(() =>
      parseDeletedBeatAllowlist({ delete_beat_ids: [123] }),
    ).toThrow(/allowlist rejected/);
    expect(
      parseDeletedBeatAllowlist({ delete_beat_ids: ["ok-id"] }),
    ).toEqual(["ok-id"]);
  });

  it("rejects legacy bare array inventory", () => {
    expect(() =>
      parseAndAssertInventoryForFinalClassify([
        { object_path: "user/x", size_bytes: 1, created_at: null },
      ]),
    ).toThrow(/rejected/);
  });

  it("digest helper is stable", () => {
    const paths = ["b", "a"];
    expect(computeKeySetDigest(paths)).toBe(computeKeySetDigest(["a", "b"]));
  });

  it("P0: CLI inventory source parses path and stdin flags", () => {
    expect(parseCliInventorySource(["--classify"])).toEqual({
      kind: "default_path",
    });
    expect(
      parseCliInventorySource(["--classify", "--inventory-path", "x.json"]),
    ).toEqual({ kind: "path", path: "x.json" });
    expect(
      parseCliInventorySource(["--classify", "--inventory-path=y.json"]),
    ).toEqual({ kind: "path", path: "y.json" });
    expect(
      parseCliInventorySource(["--classify", "--inventory-stdin"]),
    ).toEqual({ kind: "stdin" });
  });

  it("P1: incomplete DB blocks SAFE_DELETE and never calls storageRemove", async () => {
    const user =
      "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin";
    const removeCalls: string[] = [];
    const deps = depsFor(
      [{ object_path: user, size_bytes: 16044, created_at: null }],
      false,
    );
    deps.storageRemove = async (_b, paths) => {
      removeCalls.push(...paths);
      return { error: null };
    };
    const result = await executeWithDeps(deps);
    expect(result.deleted).toBe(0);
    expect(removeCalls).toHaveLength(0);
    expect(result.rows.every((r) => r.classification !== "SAFE_DELETE")).toBe(
      true,
    );
  });

  it("P1: pages_consistent=false suppresses SAFE_DELETE — no remove", async () => {
    const user =
      "user/33333333-3333-3333-3333-333333333333/44444444-4444-4444-4444-444444444444/55555555-5555-5555-5555-555555555555/master.bin";
    const removeCalls: unknown[] = [];
    const deps = depsFor(
      [{ object_path: user, size_bytes: 16044, created_at: null }],
      true,
    );
    deps.loadClassifyContext = async () => ({
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
      platformLiveAssetCount: 0,
      db_read_complete: true,
      count_complete: true,
      pages_consistent: false,
      snapshot_consistent: false,
    });
    deps.storageRemove = async (_b, paths) => {
      removeCalls.push(paths);
      return { error: null };
    };
    const classified = await classifyWithDepsAsync(deps);
    expect(classified.summary.SAFE_DELETE).toBe(0);
    const result = await executeWithDeps(deps);
    expect(result.deleted).toBe(0);
    expect(removeCalls).toHaveLength(0);
  });
});
