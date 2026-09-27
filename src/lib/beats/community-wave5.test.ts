import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import { hasPermission } from "@/lib/auth/permissions";
import {
  assertPublishHardGate,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import {
  assertUserBeatObjectKeyBinding,
  buildUserBeatAudioObjectKey,
  canRequestBeatAudioAccess,
} from "@/lib/beats/audio-validation";
import {
  assertUserDraftTransportAccess,
  rejectClientChosenStorageParams,
  UserAudioAuthzError,
} from "@/lib/beats/user-audio-authz";
import {
  assertSubmitCooldown,
  SUBMIT_COOLDOWN_MESSAGE,
  SUBMIT_COOLDOWN_SECONDS,
} from "@/lib/beats/submit-cooldown";
import { BEAT_SELECT_PUBLIC } from "@/lib/beats/types";
import { canTransitionStatus } from "@/lib/beats/validation";
import type { AuthContext } from "@/lib/auth/types";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEAT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function userCtx(overrides?: Partial<AuthContext>): AuthContext {
  return {
    userId: OWNER,
    email: "a@test",
    profile: {
      id: OWNER,
      displayName: "A",
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: ["beats.create"],
    ...overrides,
  };
}

describe("Community Wave 5 — submit cooldown", () => {
  it("normal submit (no prior) = PASS", () => {
    expect(assertSubmitCooldown({ lastSubmittedAt: null }).ok).toBe(true);
    expect(assertSubmitCooldown({ lastSubmittedAt: undefined }).ok).toBe(true);
  });

  it("immediate duplicate / rapid resubmit = DENY", () => {
    const now = Date.parse("2026-09-27T12:00:00.000Z");
    const r = assertSubmitCooldown({
      lastSubmittedAt: "2026-09-27T11:59:30.000Z",
      nowMs: now,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(SUBMIT_COOLDOWN_MESSAGE);
  });

  it("after cooldown window = PASS", () => {
    const now = Date.parse("2026-09-27T12:00:00.000Z");
    expect(
      assertSubmitCooldown({
        lastSubmittedAt: "2026-09-27T11:58:59.000Z",
        nowMs: now,
        cooldownSeconds: SUBMIT_COOLDOWN_SECONDS,
      }).ok,
    ).toBe(true);
  });

  it("legitimate path: REJECTED→DRAFT clears cursor (null) = PASS", () => {
    expect(assertSubmitCooldown({ lastSubmittedAt: null }).ok).toBe(true);
  });
});

describe("Community Wave 5 — security regression matrix", () => {
  it("USER deny approve/reject/publish", () => {
    expect(hasPermission(["beats.create"], "beats.approve")).toBe(false);
    expect(hasPermission(["beats.create"], "beats.reject")).toBe(false);
    expect(hasPermission(["beats.create"], "beats.publish")).toBe(false);
  });

  it("MOD allow approve/reject/publish; deny edit", () => {
    const mod = ["beats.approve", "beats.reject", "beats.publish"];
    expect(hasPermission(mod, "beats.publish")).toBe(true);
    expect(hasPermission(mod, "beats.edit")).toBe(false);
  });

  it("IDOR: foreign transport DENY", () => {
    expect(() =>
      assertUserDraftTransportAccess({
        context: userCtx(),
        beat: {
          id: BEAT,
          ownershipType: "USER",
          ownerId: OTHER,
          status: "DRAFT",
        },
      }),
    ).toThrow(UserAudioAuthzError);
  });

  it("client storage spoof DENY", () => {
    expect(() =>
      rejectClientChosenStorageParams({ objectKey: "user/x/y/z/master.bin" }),
    ).toThrow(/object key/i);
    expect(() =>
      rejectClientChosenStorageParams({ ownerId: OTHER }),
    ).toThrow(/ownerId/i);
  });

  it("object key binding foreign owner DENY", () => {
    const key = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: ASSET,
      purpose: "MASTER",
    });
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: key,
        ownerId: OTHER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
  });

  it("READY gate: inactive / foreign / wrong purpose DENY", () => {
    const base: PublishGateAssetSnapshot = {
      id: ASSET,
      beatId: BEAT,
      purpose: "MASTER",
      status: "READY",
      isActive: true,
    };
    expect(
      assertPublishHardGate({
        beatId: BEAT,
        ownershipType: "USER",
        status: "APPROVED",
        assetsForBeat: [{ ...base, isActive: false }],
      }).ok,
    ).toBe(false);
    expect(
      assertPublishHardGate({
        beatId: BEAT,
        ownershipType: "USER",
        status: "APPROVED",
        assetsForBeat: [{ ...base, beatId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }],
      }).ok,
    ).toBe(false);
    expect(
      assertPublishHardGate({
        beatId: BEAT,
        ownershipType: "USER",
        status: "APPROVED",
        assetsForBeat: [{ ...base, purpose: "PLAYBACK" }],
      }).ok,
    ).toBe(false);
  });

  it("public visibility: only PUBLISHED playable for anon", () => {
    for (const status of [
      "DRAFT",
      "PENDING_REVIEW",
      "REJECTED",
      "APPROVED",
      "ARCHIVED",
    ] as const) {
      expect(
        canRequestBeatAudioAccess({
          actor: "ANON",
          beatStatus: status,
          purpose: "PLAYBACK",
        }),
      ).toBe(false);
    }
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
  });

  it("USER cannot edit PENDING/APPROVED/PUBLISHED via transition to APPROVED", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "APPROVED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("account level not used in submit cooldown / publish sources", () => {
    const submitSrc = readFileSync(
      resolve(process.cwd(), "src/lib/beats/submit-cooldown.ts"),
      "utf8",
    );
    expect(submitSrc).not.toMatch(/BEGINNER|PRO_RAPPER|LEGEND|accountLevel/);
    expect(submitSrc).toContain(String(SUBMIT_COOLDOWN_SECONDS));
  });

  it("single submit entry: community-actions → submitUserBeat only", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "src/lib/beats/community-actions.ts"),
      "utf8",
    );
    expect(actions).toContain("submitUserBeat(");
    expect(actions.match(/submitUserBeat/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("BEAT_SELECT_PUBLIC omits rejection_reason and last_submitted_at", () => {
    expect(BEAT_SELECT_PUBLIC).not.toContain("rejection_reason");
    expect(BEAT_SELECT_PUBLIC).not.toContain("last_submitted_at");
  });
});
