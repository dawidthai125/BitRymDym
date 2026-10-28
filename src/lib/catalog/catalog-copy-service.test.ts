import { beforeEach, describe, expect, it, vi } from "vitest";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";
import type { AuthContext } from "@/lib/auth/types";
import { executeCatalogAssetCopyFor } from "@/lib/catalog/catalog-copy-service";
import {
  CATALOG_ASSET_NOT_COPYABLE,
  CATALOG_CONTENT_UNSUPPORTED,
  CATALOG_NOT_FOUND,
  CATALOG_PROJECT_NO_BEAT,
  CATALOG_SOURCE_UNAVAILABLE,
  CATALOG_STORAGE_POLICIES_UNAVAILABLE,
  buildCatalogCopyTakeTitle,
} from "@/lib/catalog/catalog-originals";
import { AuthError } from "@/lib/auth/session";
import { TakeClaimError } from "@/lib/takes/claim-errors";
import { BEAT_AUDIO_BUCKET, buildCatalogOriginalObjectKey } from "@/lib/beats/audio-validation";
import { buildUserTakeObjectKey } from "@/lib/takes/object-key";

const CATALOG_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "33333333-3333-4333-8333-333333333333";
const BEAT_ID = "44444444-4444-4444-8444-444444444444";
const TAKE_ID = "22222222-2222-4222-8222-222222222222";

function wavBytes(): Uint8Array {
  const bytes = new Uint8Array(12);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8);
  return bytes;
}

function auth(): AuthContext {
  return {
    userId: OWNER_ID,
    email: "user@example.com",
    profile: {
      id: OWNER_ID,
      displayName: "User",
      userNumber: 1,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: [],
  };
}

type FakeState = {
  catalogTableMissing?: boolean;
  catalogProbeError?: { code: string; message: string };
  asset?: Record<string, unknown> | null;
  project?: Record<string, unknown> | null;
  catalogObject?: Uint8Array | null;
  existingTakes?: Array<Record<string, unknown>>;
  takeObjectPresent?: boolean;
  uploadFail?: boolean;
  aborted: Array<{ takeId: string; objectKey: string | null; reason?: string }>;
  uploaded: Array<{ key: string; bytes: number }>;
  stamped: Array<Record<string, unknown>>;
};

function blobOf(bytes: Uint8Array) {
  return {
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function createFakeAdmin(state: FakeState) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let pendingPatch: Record<string, unknown> | null = null;
      const query = {
        select() {
          return query;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        is() {
          return query;
        },
        update(patch: Record<string, unknown>) {
          pendingPatch = patch;
          if (table === "takes" && patch.title) {
            state.stamped.push(patch);
          }
          return query;
        },
        async maybeSingle() {
          if (table === "catalog_assets") {
            if (state.catalogTableMissing) {
              return {
                data: null,
                error: {
                  code: "PGRST205",
                  message: "Could not find the table 'public.catalog_assets' in the schema cache",
                },
              };
            }
            if (state.catalogProbeError) {
              return { data: null, error: state.catalogProbeError };
            }
            return { data: state.asset ?? null, error: null };
          }
          if (table === "studio_projects") {
            return { data: state.project ?? null, error: null };
          }
          return { data: null, error: null };
        },
        then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
          if (
            table === "takes" &&
            pendingPatch &&
            pendingPatch.status === "FAILED"
          ) {
            state.aborted.push({
              takeId: String(filters.id ?? ""),
              objectKey: null,
              reason: String(pendingPatch.failure_reason ?? ""),
            });
          }
          if (table === "takes" && !pendingPatch) {
            return resolve({ data: state.existingTakes ?? [], error: null });
          }
          return resolve({ data: null, error: null });
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        return {
          async download(key: string) {
            if (bucket === BEAT_AUDIO_BUCKET) {
              if (!state.catalogObject) {
                return { data: null, error: { message: "missing" } };
              }
              return { data: blobOf(state.catalogObject), error: null };
            }
            if (bucket === TAKE_AUDIO_BUCKET) {
              if (!state.takeObjectPresent) {
                return { data: null, error: { message: "missing" } };
              }
              return { data: blobOf(wavBytes()), error: null };
            }
            void key;
            return { data: null, error: { message: "missing" } };
          },
          async upload(key: string, bytes: Uint8Array) {
            if (state.uploadFail) {
              return { error: { message: "upload denied" } };
            }
            state.uploaded.push({ key, bytes: bytes.byteLength });
            return { error: null };
          },
          async remove(keys: string[]) {
            state.aborted.push({
              takeId: "",
              objectKey: keys[0] ?? null,
              reason: "remove",
            });
            return { error: null };
          },
        };
      },
    },
  };
}

function publishedAsset() {
  return {
    id: CATALOG_ID,
    publish_state: "PUBLISHED",
    license_allows_copy: true,
    object_key: buildCatalogOriginalObjectKey(CATALOG_ID),
    content_type: "audio/wav",
    byte_size: 12,
    duration_seconds: 12,
  };
}

function ownedProject() {
  return { id: PROJECT_ID, owner_id: OWNER_ID, beat_id: BEAT_ID };
}

describe("executeCatalogAssetCopyFor", () => {
  const createTakeSession = vi.fn();
  const finalizeTake = vi.fn();

  beforeEach(() => {
    createTakeSession.mockReset();
    finalizeTake.mockReset();
  });

  it("fail-closes when catalog_assets is missing — no claim/upload", async () => {
    const state: FakeState = { catalogTableMissing: true, aborted: [], uploaded: [], stamped: [] };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: CATALOG_STORAGE_POLICIES_UNAVAILABLE,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
    expect(state.uploaded).toEqual([]);
  });

  it("fail-closes unpublished assets without writing a TAKE", async () => {
    const state: FakeState = {
      asset: { ...publishedAsset(), publish_state: "WITHDRAWN" },
      project: ownedProject(),
      catalogObject: wavBytes(),
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: CATALOG_ASSET_NOT_COPYABLE,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
  });

  it("fail-closes sniff failure without writing a TAKE", async () => {
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0, 0, 0, 0, 0]),
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: CATALOG_CONTENT_UNSUPPORTED,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
    expect(state.uploaded).toEqual([]);
  });

  it("rejects a project without beat before any Storage write", async () => {
    const state: FakeState = {
      asset: publishedAsset(),
      project: { id: PROJECT_ID, owner_id: OWNER_ID, beat_id: null },
      catalogObject: wavBytes(),
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: CATALOG_PROJECT_NO_BEAT,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
  });

  it("returns CATALOG_NOT_FOUND when the asset row is missing", async () => {
    const state: FakeState = {
      asset: null,
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({ ok: false, error: CATALOG_NOT_FOUND });
  });

  it("returns SOURCE_UNAVAILABLE when catalog original bytes are missing", async () => {
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: null,
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: CATALOG_SOURCE_UNAVAILABLE,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
  });

  it("reuses an existing READY copy with a matching object", async () => {
    const objectKey = buildUserTakeObjectKey({ ownerId: OWNER_ID, takeId: TAKE_ID });
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: wavBytes(),
      existingTakes: [
        {
          id: TAKE_ID,
          status: "READY",
          object_key: objectKey,
          storage_bucket: TAKE_AUDIO_BUCKET,
          beat_id: BEAT_ID,
          title: buildCatalogCopyTakeTitle({
            catalogAssetId: CATALOG_ID,
            projectId: PROJECT_ID,
          }),
        },
      ],
      takeObjectPresent: true,
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toEqual({
      ok: true,
      takeId: TAKE_ID,
      beatId: BEAT_ID,
      objectKey,
      catalogAssetId: CATALOG_ID,
      status: "READY",
      reusedExisting: true,
    });
    expect(createTakeSession).not.toHaveBeenCalled();
    expect(state.uploaded).toEqual([]);
  });

  it("copies catalog original into a private TAKE and stamps provenance", async () => {
    const destKey = buildUserTakeObjectKey({ ownerId: OWNER_ID, takeId: TAKE_ID });
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: wavBytes(),
      existingTakes: [],
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    createTakeSession.mockResolvedValue({
      takeId: TAKE_ID,
      beatId: BEAT_ID,
      objectKey: destKey,
    });
    finalizeTake.mockResolvedValue({
      takeId: TAKE_ID,
      beatId: BEAT_ID,
      status: "READY",
      durationSeconds: 12,
      byteSize: 12,
      contentType: "audio/wav",
    });

    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );

    expect(result).toEqual({
      ok: true,
      takeId: TAKE_ID,
      beatId: BEAT_ID,
      objectKey: destKey,
      catalogAssetId: CATALOG_ID,
      status: "READY",
      reusedExisting: false,
    });
    expect(createTakeSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER_ID }),
      {
        beatId: BEAT_ID,
        contentType: "audio/wav",
        byteSize: 12,
      },
    );
    expect(state.uploaded).toEqual([{ key: destKey, bytes: 12 }]);
    expect(state.stamped[0]).toMatchObject({
      recording_mode: "QUICK",
      title: buildCatalogCopyTakeTitle({
        catalogAssetId: CATALOG_ID,
        projectId: PROJECT_ID,
      }),
    });
    expect(finalizeTake).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER_ID }),
      { takeId: TAKE_ID },
    );
    expect(state.aborted).toEqual([]);
  });

  it("cleans claimed take + object when upload fails (zero orphans)", async () => {
    const destKey = buildUserTakeObjectKey({ ownerId: OWNER_ID, takeId: TAKE_ID });
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: wavBytes(),
      existingTakes: [],
      uploadFail: true,
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    createTakeSession.mockResolvedValue({
      takeId: TAKE_ID,
      beatId: BEAT_ID,
      objectKey: destKey,
    });

    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );

    expect(result.ok).toBe(false);
    expect(finalizeTake).not.toHaveBeenCalled();
    expect(state.aborted.some((row) => row.takeId === TAKE_ID)).toBe(true);
    expect(state.aborted.some((row) => row.objectKey === destKey)).toBe(true);
  });

  it("maps TAKE cap from the existing claim RPC", async () => {
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: wavBytes(),
      existingTakes: [],
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    createTakeSession.mockRejectedValue(
      new TakeClaimError("REPLACE_REQUIRED", "ACTIVE_READY_CAP"),
    );
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({ ok: false, error: "TAKE_CAP" });
    expect(state.uploaded).toEqual([]);
  });

  it("maps unauthenticated claim denial", async () => {
    const state: FakeState = {
      asset: publishedAsset(),
      project: ownedProject(),
      catalogObject: wavBytes(),
      existingTakes: [],
      aborted: [],
      uploaded: [],
      stamped: [],
    };
    createTakeSession.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "Authentication required."),
    );
    const result = await executeCatalogAssetCopyFor(
      auth(),
      { catalogAssetId: CATALOG_ID, projectId: PROJECT_ID },
      {
        admin: createFakeAdmin(state) as never,
        createTakeSession,
        finalizeTake,
      },
    );
    expect(result).toMatchObject({ ok: false, error: "UNAUTHENTICATED" });
  });
});
