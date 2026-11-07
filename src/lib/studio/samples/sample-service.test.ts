import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import { buildCatalogOriginalObjectKey } from "@/lib/beats/audio-validation";
import {
  SAMPLE_FORBIDDEN,
  SAMPLE_RIGHTS_REQUIRED,
  SAMPLE_TABLE_UNAVAILABLE,
  buildUserSampleObjectKey,
} from "@/lib/studio/samples/sample-policy";
import {
  copyStudioSampleToTake,
  createStudioSample,
  reviewStudioSample,
} from "@/lib/studio/samples/sample-service";
import { encodePcm16Wav, renderInstrumentSample, SAMPLE_RATE } from "@/lib/studio/samples/sample-synth";

const OWNER = "33333333-3333-4333-8333-333333333333";
const OTHER = "55555555-5555-4555-8555-555555555555";
const SAMPLE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CATALOG_ID = "99999999-8888-4777-8666-555555555555";
const REVIEWER = "12121212-1212-4121-8121-121212121212";

function auth(userId = OWNER): AuthContext {
  return {
    userId,
    email: "user@example.com",
    profile: {
      id: userId,
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

function wav(): Uint8Array {
  return encodePcm16Wav(
    renderInstrumentSample({ instrument: "piano", midi: 60, durationMs: 1000 }),
    SAMPLE_RATE,
  );
}

type State = {
  missing?: boolean;
  row?: Record<string, unknown> | null;
  count?: number;
  uploads: Array<{ bucket: string; key: string }>;
  inserts: Array<{ table: string; row: Record<string, unknown> }>;
  updates: Array<{ table: string; patch: Record<string, unknown> }>;
};

function blobOf(bytes: Uint8Array) {
  return {
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}

function adminFor(state: State) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const api = {
        select() {
          return api;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        is() {
          return api;
        },
        insert(row: Record<string, unknown>) {
          state.inserts.push({ table, row });
          return api;
        },
        update(patch: Record<string, unknown>) {
          state.updates.push({ table, patch });
          return api;
        },
        delete() {
          return api;
        },
        maybeSingle: async () => {
          if (state.missing) {
            return {
              data: null,
              error: { code: "42P01", message: "relation studio_samples does not exist" },
            };
          }
          return { data: state.row ?? null, error: null };
        },
        single: async () => ({
          data: state.inserts.at(-1)?.row ?? null,
          error: null,
        }),
        then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const payload = state.missing
            ? {
                data: null,
                error: { code: "42P01", message: "relation studio_samples does not exist" },
                count: null,
              }
            : { data: [], error: null, count: state.count ?? 0 };
          return Promise.resolve(payload).then(resolve, reject);
        },
      };
      return api;
    },
    storage: {
      from(bucket: string) {
        return {
          upload: async (key: string) => {
            state.uploads.push({ bucket, key });
            return { error: null };
          },
          download: async () => ({ data: blobOf(wav()), error: null }),
          remove: async () => ({ error: null }),
          createSignedUrl: async () => ({
            data: { signedUrl: "https://example.test/sample" },
            error: null,
          }),
        };
      },
    },
  };
}

describe("studio sample service", () => {
  it("does not store a sample when rights are missing", async () => {
    const state: State = { uploads: [], inserts: [], updates: [], count: 0 };
    const result = await createStudioSample(
      auth(),
      {
        title: "Fortepian",
        kind: "instrument",
        instrument: "piano",
        rightsAccepted: false,
        bytes: wav(),
        declaredContentType: "audio/wav",
        cap: 5,
      },
      adminFor(state) as never,
      SAMPLE_ID,
    );
    expect(result).toMatchObject({ ok: false, error: SAMPLE_RIGHTS_REQUIRED });
    expect(state.uploads).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it("fails closed when the sample table is missing", async () => {
    const state: State = { missing: true, uploads: [], inserts: [], updates: [] };
    const result = await copyStudioSampleToTake(
      auth(),
      { sampleId: SAMPLE_ID, projectId: "11111111-1111-4111-8111-111111111111" },
      { admin: adminFor(state) as never },
    );
    expect(result).toMatchObject({ ok: false, error: SAMPLE_TABLE_UNAVAILABLE });
  });

  it("refuses another user's private sample", async () => {
    const state: State = {
      uploads: [],
      inserts: [],
      updates: [],
      row: {
        id: SAMPLE_ID,
        owner_id: OTHER,
        title: "Prywatny",
        kind: "instrument",
        instrument: "piano",
        status: "PRIVATE",
        rights_accepted: true,
        object_key: buildUserSampleObjectKey(SAMPLE_ID),
        content_type: "audio/wav",
        byte_size: 10,
        duration_ms: 1000,
        catalog_asset_id: null,
        moderation_note: null,
      },
    };
    const result = await copyStudioSampleToTake(
      auth(OWNER),
      { sampleId: SAMPLE_ID, projectId: "11111111-1111-4111-8111-111111111111" },
      { admin: adminFor(state) as never },
    );
    expect(result).toMatchObject({ ok: false, error: SAMPLE_FORBIDDEN });
    expect(state.uploads).toHaveLength(0);
  });

  it("publishes by copying bytes onto the catalog original key", async () => {
    const bytes = wav();
    const state: State = {
      uploads: [],
      inserts: [],
      updates: [],
      row: {
        id: SAMPLE_ID,
        owner_id: OWNER,
        title: "Stopa",
        kind: "effect",
        instrument: "kick",
        status: "PENDING_REVIEW",
        rights_accepted: true,
        object_key: buildUserSampleObjectKey(SAMPLE_ID),
        content_type: "audio/wav",
        byte_size: bytes.byteLength,
        duration_ms: 1000,
        catalog_asset_id: null,
        moderation_note: null,
      },
    };
    const result = await reviewStudioSample(
      auth(REVIEWER),
      { sampleId: SAMPLE_ID, action: "approve", note: "ok" },
      { admin: adminFor(state) as never, catalogAssetId: CATALOG_ID },
    );
    expect(result).toMatchObject({
      ok: true,
      status: "PUBLISHED",
      catalogAssetId: CATALOG_ID,
    });
    expect(state.uploads.map((item) => item.key)).toContain(
      buildCatalogOriginalObjectKey(CATALOG_ID),
    );
    expect(state.inserts[0]?.table).toBe("catalog_assets");
    expect(state.inserts[0]?.row).toMatchObject({
      id: CATALOG_ID,
      publish_state: "PUBLISHED",
      license_allows_copy: true,
      license_allows_export: false,
      object_key: buildCatalogOriginalObjectKey(CATALOG_ID),
    });
    expect(state.updates[0]?.patch).toMatchObject({
      status: "PUBLISHED",
      catalog_asset_id: CATALOG_ID,
    });
  });

  it("rejects without creating a catalog original", async () => {
    const bytes = wav();
    const state: State = {
      uploads: [],
      inserts: [],
      updates: [],
      row: {
        id: SAMPLE_ID,
        owner_id: OWNER,
        title: "Stopa",
        kind: "effect",
        instrument: "kick",
        status: "PENDING_REVIEW",
        rights_accepted: true,
        object_key: buildUserSampleObjectKey(SAMPLE_ID),
        content_type: "audio/wav",
        byte_size: bytes.byteLength,
        duration_ms: 1000,
        catalog_asset_id: null,
        moderation_note: null,
      },
    };
    const result = await reviewStudioSample(
      auth(REVIEWER),
      { sampleId: SAMPLE_ID, action: "reject", note: "cudzy bit" },
      { admin: adminFor(state) as never },
    );
    expect(result).toMatchObject({ ok: true, status: "REJECTED", catalogAssetId: null });
    expect(state.uploads).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
    expect(state.updates[0]?.patch.status).toBe("REJECTED");
  });
});
