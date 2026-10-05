import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import { hasPermission } from "@/lib/auth/permissions";
import {
  assertPublishHardGate,
  canCommunityPublishFromUi,
  getCommunityPublishGate,
  isActiveMasterReadyForBeat,
  PUBLISH_REQUIRES_APPROVED,
  PUBLISH_REQUIRES_READY_MASTER,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import {
  assertUserBeatObjectKeyBinding,
  buildUserBeatAudioObjectKey,
  canRequestBeatAudioAccess,
} from "@/lib/beats/audio-validation";
import { canTransitionStatus } from "@/lib/beats/validation";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEAT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FOREIGN_BEAT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function readyMaster(
  overrides: Partial<PublishGateAssetSnapshot> = {},
): PublishGateAssetSnapshot {
  return {
    id: ASSET,
    beatId: BEAT,
    purpose: "MASTER",
    status: "READY",
    isActive: true,
    ...overrides,
  };
}

describe("Community Wave 4 — staff publish APPROVED USER beats", () => {
  it("A: USER cannot publish APPROVED (transition)", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
    expect(hasPermission(["beats.create"], "beats.publish")).toBe(false);
  });

  it("B: USER foreign APPROVED publish = DENY", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: false,
      }),
    ).toBe(false);
  });

  it("C/D/E: USER cannot publish DRAFT / PENDING / REJECTED", () => {
    for (const from of ["DRAFT", "PENDING_REVIEW", "REJECTED"] as const) {
      expect(
        canTransitionStatus({
          from,
          to: "PUBLISHED",
          actor: "USER",
          ownershipType: "USER",
          isOwner: true,
        }),
      ).toBe(false);
    }
  });

  it("F: MODERATOR APPROVED USER → PUBLISHED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      hasPermission(["beats.approve", "beats.reject", "beats.publish"], "beats.publish"),
    ).toBe(true);
  });

  it("G/H/I: MOD cannot publish PENDING / DRAFT / REJECTED via gate", () => {
    for (const status of ["PENDING_REVIEW", "DRAFT", "REJECTED"] as const) {
      const gate = assertPublishHardGate({
        beatId: BEAT,
        ownershipType: "USER",
        status,
        assetsForBeat: [readyMaster()],
      });
      expect(gate.ok).toBe(false);
      expect(
        canTransitionStatus({
          from: status,
          to: "PUBLISHED",
          actor: "MODERATOR",
          ownershipType: "USER",
        }),
      ).toBe(false);
    }
  });

  it("J: MOD publish without READY = DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [
        readyMaster({ status: "PENDING_UPLOAD" }),
      ],
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe(PUBLISH_REQUIRES_READY_MASTER);
  });

  it("K: MOD does not get beats.edit (metadata escalation deny)", () => {
    expect(
      hasPermission(["beats.approve", "beats.reject", "beats.publish"], "beats.edit"),
    ).toBe(false);
  });

  it("N: foreign asset beatId = DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyMaster({ beatId: FOREIGN_BEAT })],
    });
    expect(gate.ok).toBe(false);
  });

  it("O: inactive READY = DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyMaster({ isActive: false })],
    });
    expect(gate.ok).toBe(false);
    expect(
      isActiveMasterReadyForBeat({
        beatId: BEAT,
        asset: readyMaster({ isActive: false }),
      }),
    ).toBe(false);
  });

  it("P: wrong purpose = DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyMaster({ purpose: "PLAYBACK" })],
    });
    expect(gate.ok).toBe(false);
  });

  it("Q: ADMIN APPROVED USER → PUBLISHED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "ADMIN",
        ownershipType: "USER",
      }),
    ).toBe(true);
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyMaster()],
    });
    expect(gate.ok).toBe(true);
  });

  it("R: PLATFORM DRAFT → PUBLISHED READY = PASS (regression)", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "ADMIN",
        ownershipType: "PLATFORM",
      }),
    ).toBe(true);
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [readyMaster()],
    });
    expect(gate.ok).toBe(true);
  });

  it("object key binding: correct USER key = PASS; foreign owner = DENY", () => {
    const key = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT,
      assetId: ASSET,
      purpose: "MASTER",
    });
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: key,
        ownerId: OWNER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(true);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: key,
        ownerId: OTHER,
        beatId: BEAT,
        assetId: ASSET,
      }).ok,
    ).toBe(false);
  });

  it("UI community publish gate: APPROVED + READY only", () => {
    expect(
      canCommunityPublishFromUi({
        status: "APPROVED",
        ownershipType: "USER",
        activeMasterReady: true,
      }),
    ).toBe(true);
    expect(
      getCommunityPublishGate({
        status: "PENDING_REVIEW",
        ownershipType: "USER",
        activeMasterReady: true,
      }).blockedReason,
    ).toBe(PUBLISH_REQUIRES_APPROVED);
    expect(
      getCommunityPublishGate({
        status: "APPROVED",
        ownershipType: "USER",
        activeMasterReady: false,
      }).blockedReason,
    ).toBe(PUBLISH_REQUIRES_READY_MASTER);
  });

  it("public visibility: APPROVED deny; PUBLISHED allow playback", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "APPROVED",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "USER",
      }),
    ).toBe(true);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "PUBLISHED",
        purpose: "DOWNLOAD",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
  });

  it("account level does not appear in publish AuthZ surface", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/beats/service.ts"),
      "utf8",
    );
    const publishFn = src.slice(
      src.indexOf("export async function publishApprovedUserBeat"),
      src.indexOf("export async function archiveOwnUserBeat"),
    );
    expect(publishFn).not.toMatch(/BEGINNER_RAPPER|PRO_RAPPER|LEGEND_RAPPER|accountLevel/);
    expect(publishFn).toContain("beats.publish");
    expect(publishFn).toContain("assertActiveMasterReadyForPublish");
  });

  it("publish action is status-only (no metadata fields in community action)", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/beats/community-actions.ts"),
      "utf8",
    );
    expect(src).toContain("publishApprovedUserBeatAction");
    const publishAction = src.slice(
      src.indexOf("publishApprovedUserBeatAction"),
      src.indexOf("publishApprovedUserBeatAction") + 400,
    );
    expect(publishAction).not.toContain("title");
    expect(publishAction).not.toContain("ownerId");
  });
});
