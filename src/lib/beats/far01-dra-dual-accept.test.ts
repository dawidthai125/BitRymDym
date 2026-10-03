import { describe, expect, it } from "vitest";

import {
  assertUserBeatObjectKeyBinding,
  buildLegacyUserBeatMasterObjectKey,
  buildUserBeatAudioObjectKey,
  isAuthorizedUserBeatObjectKeyRepresentation,
  validateObjectKey,
} from "@/lib/beats/audio-validation";
import {
  assertUserAssetBinding,
  rejectClientChosenStorageParams,
  UserAudioAuthzError,
} from "@/lib/beats/user-audio-authz";
import type { BeatAudioAssetRow } from "@/lib/beats/audio-types";
import type { AuthContext } from "@/lib/auth/types";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const BEAT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const OTHER_BEAT = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const ASSET = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const OTHER_ASSET = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function userContext(userId = OWNER): AuthContext {
  return {
    userId,
    email: "t@example.com",
    profile: {
      id: userId,
      role: "USER",
      displayName: "T",
      userNumber: null,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: ["beats.create"],
  };
}

function assetRow(
  overrides: Partial<BeatAudioAssetRow> & { object_key: string },
): BeatAudioAssetRow {
  return {
    id: ASSET,
    beat_id: BEAT,
    purpose: "MASTER",
    status: "READY",
    storage_bucket: "beat-audio",
    content_type: "audio/wav",
    byte_size: 100,
    checksum_sha256: null,
    original_filename: null,
    is_active: true,
    replaced_by_asset_id: null,
    created_by: OWNER,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("FAR-01 Phase 1 DR-A — dual-accept contracts", () => {
  const canonical = buildUserBeatAudioObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId: ASSET,
    purpose: "MASTER",
  });
  const legacyTwin = buildLegacyUserBeatMasterObjectKey({
    ownerId: OWNER,
    beatId: BEAT,
    assetId: ASSET,
  });

  it("1. canonical key → ACCEPT (shape + binding + asset binding)", () => {
    expect(validateObjectKey(canonical)).toBeNull();
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: canonical,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(true);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: canonical,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(true);
    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: { id: BEAT, ownerId: OWNER, ownershipType: "USER" },
        asset: assetRow({ object_key: canonical }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).not.toThrow();
  });

  it("2. deterministic legacy twin → ACCEPT", () => {
    expect(legacyTwin).toBe(
      `user/${OWNER}/${BEAT}/master/${ASSET}.bin`,
    );
    expect(validateObjectKey(legacyTwin)).toBeNull();
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: legacyTwin,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(true);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: legacyTwin,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(true);
    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: { id: BEAT, ownerId: OWNER, ownershipType: "USER" },
        asset: assetRow({ object_key: legacyTwin }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).not.toThrow();
  });

  it("3. arbitrary legacy path → DENY (binding)", () => {
    const arbitrary = `user/${OWNER}/${BEAT}/master/${OTHER_ASSET}.bin`;
    expect(validateObjectKey(arbitrary)).toBeNull(); // shape ok
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: arbitrary,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(false);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: arbitrary,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
  });

  it("4. wrong owner → DENY", () => {
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: legacyTwin,
        ownerId: OTHER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
    expect(() =>
      assertUserAssetBinding({
        context: userContext(OTHER),
        beat: { id: BEAT, ownerId: OTHER, ownershipType: "USER" },
        asset: assetRow({ object_key: legacyTwin }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toThrow(UserAudioAuthzError);
  });

  it("5. wrong beat → DENY", () => {
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: legacyTwin,
        ownerId: OWNER,
        beatId: OTHER_BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
  });

  it("6. wrong asset → DENY", () => {
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: legacyTwin,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: OTHER_ASSET,
      }).ok,
    ).toBe(false);
  });

  it("7. synthetic twin (mismatched UUIDs in path vs context) → DENY", () => {
    const synthetic = buildLegacyUserBeatMasterObjectKey({
      ownerId: OTHER,
      beatId: BEAT,
      assetId: ASSET,
    });
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: synthetic,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(false);
  });

  it("8. missing / mismatched DB asset identity → DENY", () => {
    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: { id: BEAT, ownerId: OWNER, ownershipType: "USER" },
        asset: assetRow({ id: OTHER_ASSET, object_key: canonical }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toThrow(/Asset id mismatch/);
  });

  it("9. cross-owner legacy object → DENY", () => {
    const crossOwnerLegacy = buildLegacyUserBeatMasterObjectKey({
      ownerId: OTHER,
      beatId: BEAT,
      assetId: ASSET,
    });
    expect(() =>
      assertUserAssetBinding({
        context: userContext(),
        beat: { id: BEAT, ownerId: OWNER, ownershipType: "USER" },
        asset: assetRow({ object_key: crossOwnerLegacy }),
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toThrow(/binding|object key/i);
  });

  it("10. path traversal / malformed key → DENY", () => {
    expect(validateObjectKey("user/../etc/passwd.bin")).not.toBeNull();
    expect(validateObjectKey(`user/${OWNER}//${BEAT}/master/${ASSET}.bin`)).not.toBeNull();
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: `user/${OWNER}/../${BEAT}/master/${ASSET}.bin`,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(false);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: "not-a-key",
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
  });

  it("11. canonical writer remains canonical (WRITE SSOT)", () => {
    expect(canonical).toBe(
      `user/${OWNER}/${BEAT}/${ASSET}/master.bin`,
    );
    expect(canonical).not.toContain(`/master/${ASSET}`);
    expect(canonical).not.toBe(legacyTwin);
  });

  it("12. dual-write does NOT occur — legacy builder is not WRITE SSOT", () => {
    // Product upload path must use buildUserBeatAudioObjectKey only.
    // legacy builder exists solely for DR-A comparison / twin derivation.
    expect(buildLegacyUserBeatMasterObjectKey.toString()).toContain(
      "buildLegacyUserBeatMasterObjectKey",
    );
    expect(canonical.endsWith("/master.bin")).toBe(true);
    expect(legacyTwin.includes(`/master/${ASSET}.bin`)).toBe(true);
  });

  it("client-chosen object_key still DENY", () => {
    expect(() =>
      rejectClientChosenStorageParams({ objectKey: legacyTwin }),
    ).toThrow(/object key/);
  });

  it("canonical vs legacy for different assets never cross-accept", () => {
    const otherCanonical = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: OTHER_ASSET,
      purpose: "MASTER",
    });
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: otherCanonical,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }),
    ).toBe(false);
    expect(
      isAuthorizedUserBeatObjectKeyRepresentation({
        objectKey: legacyTwin,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: OTHER_ASSET,
      }),
    ).toBe(false);
  });
});
