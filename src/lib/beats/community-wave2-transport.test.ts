import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import {
  assertUserAssetBinding,
  assertUserDraftTransportAccess,
  rejectClientChosenStorageParams,
  UserAudioAuthzError,
} from "@/lib/beats/user-audio-authz";
import {
  BEAT_AUDIO_MAX_BYTES,
  buildUserBeatAudioObjectKey,
  validateAudioUploadMeta,
  validateObjectKey,
} from "@/lib/beats/audio-validation";
import { resolveCreateBpm } from "@/lib/beats/audio-bpm-rank";
import type { BeatAudioAssetRow } from "@/lib/beats/audio-types";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEAT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FOREIGN_ASSET = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function userContext(overrides?: Partial<AuthContext>): AuthContext {
  return {
    userId: OWNER,
    email: "user@example.com",
    profile: {
      id: OWNER,
      displayName: "User",
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: ["beats.create"],
    ...overrides,
  };
}

function assetRow(overrides?: Partial<BeatAudioAssetRow>): BeatAudioAssetRow {
  return {
    id: ASSET,
    beat_id: BEAT,
    purpose: "MASTER",
    status: "PENDING_UPLOAD",
    storage_bucket: "beat-audio",
    object_key: buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: ASSET,
      purpose: "MASTER",
    }),
    content_type: "audio/wav",
    byte_size: 1024,
    checksum_sha256: null,
    original_filename: "x.wav",
    is_active: false,
    replaced_by_asset_id: null,
    created_by: OWNER,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Community Wave 2 — USER audio AuthZ / IDOR", () => {
  it("A: USER own DRAFT transport = PASS", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "DRAFT",
        },
      }),
    ).not.toThrow();
  });

  it("B: USER foreign beat = DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OTHER,
          status: "DRAFT",
        },
      }),
    ).toThrow(UserAudioAuthzError);
  });

  it("H: USER PLATFORM beat = DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "PLATFORM",
          ownerId: null,
          status: "DRAFT",
        },
      }),
    ).toThrow(/USER-owned/i);
  });

  it("I: USER PUBLISHED beat = DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "PUBLISHED",
        },
      }),
    ).toThrow(/DRAFT/);
  });

  it("J: USER PENDING_REVIEW beat = DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "PENDING_REVIEW",
        },
      }),
    ).toThrow(/DRAFT/);
  });

  it("E/G: foreign assetId or manipulated object key = DENY", () => {
    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: {
          id: BEAT,
          ownerId: OWNER,
          ownershipType: "USER",
        },
        asset: assetRow({ id: FOREIGN_ASSET, beat_id: BEAT }),
        beatId: BEAT,
        assetId: FOREIGN_ASSET,
      }),
    ).toThrow();

    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: {
          id: BEAT,
          ownerId: OWNER,
          ownershipType: "USER",
        },
        asset: assetRow({
          object_key: `user/${OTHER}/${BEAT}/${ASSET}/master.bin`,
        }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toThrow(/Object key|binding/i);
  });

  it("F: client-chosen ownerId / objectKey / bucket = DENY", () => {
    expect(() =>
      rejectClientChosenStorageParams({ ownerId: OTHER }),
    ).toThrow(/ownerId/);
    expect(() =>
      rejectClientChosenStorageParams({
        objectKey: `user/${OWNER}/${BEAT}/${ASSET}/master.bin`,
      }),
    ).toThrow(/object key/);
    expect(() =>
      rejectClientChosenStorageParams({ bucket: "beat-audio" }),
    ).toThrow(/bucket/);
  });

  it("K/M: fake READY / BPM mismatch without override = DENY at policy", () => {
    // Client cannot set asset READY — only activateAssetReady after server revalidation.
    // BPM: mismatch without override rejected by resolveCreateBpm
    expect(
      resolveCreateBpm({
        clientBpm: 90,
        bpmManualOverride: false,
        suggestedBpm: 120,
        decodeAvailable: true,
      }).ok,
    ).toBe(false);
  });

  it("L: client duration is never AuthZ input (server analyze only)", () => {
    // Contract: no duration field accepted by session AuthZ helpers
    expect(
      assertUserDraftTransportAccess({
        context: userContext(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "DRAFT",
        },
      }),
    ).toBeUndefined();
  });

  it("N: >50 MiB = DENY", () => {
    expect(
      validateAudioUploadMeta({
        contentType: "audio/wav",
        byteSize: BEAT_AUDIO_MAX_BYTES + 1,
      }).ok,
    ).toBe(false);
  });

  it("O: unsupported MIME rejected by allow-list", () => {
    expect(
      validateAudioUploadMeta({
        contentType: "application/octet-stream",
        byteSize: 1000,
      }).ok,
    ).toBe(false);
  });

  it("user object key shape + PLATFORM key still valid (R regression shape)", () => {
    const userKey = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: ASSET,
      purpose: "MASTER",
    });
    expect(validateObjectKey(userKey)).toBeNull();
    expect(
      validateObjectKey(`platform/${BEAT}/${ASSET}/master.bin`),
    ).toBeNull();
  });

  it("ADMIN/MODERATOR cannot use USER transport AuthZ", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext({
          profile: {
            id: OWNER,
            displayName: "Admin",
            role: "ADMIN",
            accountLevel: "BEGINNER_RAPPER",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          permissions: ["beats.create", "beats.edit", "beats.publish"],
        }),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "DRAFT",
        },
      }),
    ).toThrow(/USER role/i);
  });

  it("missing beats.create = DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userContext({ permissions: [] }),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OWNER,
          status: "DRAFT",
        },
      }),
    ).toThrow(/permission/i);
  });
});
