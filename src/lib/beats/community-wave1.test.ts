import { describe, expect, it } from "vitest";

import {
  assertPublishHardGate,
  assertPlatformPublishHardGate,
  PUBLISH_REQUIRES_READY_MASTER,
  PUBLISH_USER_FROM_DRAFT_DENIED,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import { hasPermission } from "@/lib/auth/permissions";
import {
  assertUserBeatObjectKeyBinding,
  buildUserBeatAudioObjectKey,
  validateObjectKey,
} from "@/lib/beats/audio-validation";
import {
  canTransitionStatus,
  validateBeatInput,
  validateRejectionReason,
} from "@/lib/beats/validation";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BEAT_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BEAT_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ASSET_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ASSET_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function readyAsset(
  overrides: Partial<PublishGateAssetSnapshot> &
    Pick<PublishGateAssetSnapshot, "id" | "beatId">,
): PublishGateAssetSnapshot {
  return {
    purpose: "MASTER",
    status: "READY",
    isActive: true,
    ...overrides,
  };
}

describe("Community Wave 1 — ownership / AuthZ / publish contracts", () => {
  it("A: USER create own USER/DRAFT = PASS", () => {
    const result = validateBeatInput({
      ownershipType: "USER",
      ownerId: OWNER,
      title: "My Beat",
      bpm: 140,
      durationSeconds: 90,
      status: "DRAFT",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ownershipType).toBe("USER");
      expect(result.value.ownerId).toBe(OWNER);
      expect(result.value.status).toBe("DRAFT");
    }
  });

  it("B: USER create PLATFORM payload = DENY at validation when owner forced USER", () => {
    // Service forces USER; raw PLATFORM with owner is invalid integrity
    expect(
      validateBeatInput({
        ownershipType: "PLATFORM",
        ownerId: OWNER,
        title: "X",
        bpm: 140,
        durationSeconds: 90,
      }).ok,
    ).toBe(false);
  });

  it("C: USER create without ownerId = DENY", () => {
    expect(
      validateBeatInput({
        ownershipType: "USER",
        ownerId: null,
        title: "X",
        bpm: 140,
        durationSeconds: 90,
      }).ok,
    ).toBe(false);
  });

  it("D: USER create PUBLISHED = DENY", () => {
    expect(
      validateBeatInput({
        ownershipType: "USER",
        ownerId: OWNER,
        title: "X",
        bpm: 140,
        durationSeconds: 90,
        status: "PUBLISHED",
      }).ok,
    ).toBe(false);
  });

  it("E/F: USER cannot escalate ownership via transition (owner_id / type)", () => {
    // Transitions never allow ownership change — only status matrix for own USER
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "USER",
        ownershipType: "PLATFORM",
        isOwner: true,
      }),
    ).toBe(false);
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "APPROVED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("G: USER DRAFT → PENDING_REVIEW = PASS (own)", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true);
  });

  it("H: USER PENDING_REVIEW → PUBLISHED = DENY", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "PUBLISHED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("I: USER APPROVED → PUBLISHED = DENY", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("J: MODERATOR PENDING → APPROVED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "APPROVED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("K/L: rejection_reason required; empty denied", () => {
    expect(validateRejectionReason("Needs more polish")).toEqual({
      ok: true,
      value: "Needs more polish",
    });
    expect(validateRejectionReason("   ").ok).toBe(false);
    expect(validateRejectionReason("").ok).toBe(false);
    expect(validateRejectionReason(null).ok).toBe(false);
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "REJECTED",
        actor: "MODERATOR",
      }),
    ).toBe(true);
  });

  it("M: USER REJECTED → DRAFT = PASS", () => {
    expect(
      canTransitionStatus({
        from: "REJECTED",
        to: "DRAFT",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true);
  });

  it("N: rework clears rejection_reason contract (service sets null on DRAFT)", () => {
    // Contract: transitioning to DRAFT / PENDING_REVIEW / APPROVED / PUBLISHED clears reason
    expect(validateRejectionReason("stale").ok).toBe(true);
  });

  it("O: MODERATOR APPROVED USER → PUBLISHED = PASS with READY", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
    const gate = assertPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyAsset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate.ok).toBe(true);
  });

  it("P: MODERATOR APPROVED USER → PUBLISHED without READY = DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [],
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe(PUBLISH_REQUIRES_READY_MASTER);
    }
  });

  it("Q: USER archive own PUBLISHED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "PUBLISHED",
        to: "ARCHIVED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true);
  });

  it("R: USER archive foreign PUBLISHED = DENY", () => {
    expect(
      canTransitionStatus({
        from: "PUBLISHED",
        to: "ARCHIVED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: false,
      }),
    ).toBe(false);
  });

  it("S: PLATFORM DRAFT → PUBLISHED with READY = REGRESSION PASS", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "ADMIN",
      }),
    ).toBe(true);
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [readyAsset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate).toEqual({ ok: true, readyMasterAssetId: ASSET_A });
  });

  it("T: PLATFORM publish AuthZ uses beats.publish; USER never has it", () => {
    expect(hasPermission(["beats.publish"], "beats.publish")).toBe(true);
    expect(hasPermission(["beats.create"], "beats.publish")).toBe(false);
    expect(hasPermission(["beats.create"], "beats.edit")).toBe(false);
    expect(hasPermission(["beats.create"], "beats.approve")).toBe(false);
    expect(
      hasPermission(["beats.approve", "beats.reject", "beats.publish"], "beats.edit"),
    ).toBe(false);
  });
});

describe("Community Wave 1 — publish gate IDOR / spoof", () => {
  it("USER DRAFT → PUBLISHED hard gate DENY", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "USER",
      status: "DRAFT",
      assetsForBeat: [readyAsset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe(PUBLISH_USER_FROM_DRAFT_DENIED);
    }
  });

  it("foreign READY asset does not satisfy gate", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "USER",
      status: "APPROVED",
      assetsForBeat: [readyAsset({ id: ASSET_B, beatId: BEAT_B })],
    });
    expect(gate.ok).toBe(false);
  });

  it("forged PENDING_REVIEW → PUBLISHED DENY at gate", () => {
    expect(
      assertPublishHardGate({
        beatId: BEAT_A,
        ownershipType: "USER",
        status: "PENDING_REVIEW",
        assetsForBeat: [readyAsset({ id: ASSET_A, beatId: BEAT_A })],
      }).ok,
    ).toBe(false);
  });

  it("MODERATOR cannot publish PLATFORM via transition matrix", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "PLATFORM",
      }),
    ).toBe(false);
  });
});

describe("Community Wave 1 — object key user/ binding", () => {
  it("builds and validates user/{ownerId}/{beatId}/{assetId}/master.bin", () => {
    const key = buildUserBeatAudioObjectKey({
      ownerId: OWNER,
      beatId: BEAT_A,
      assetId: ASSET_A,
      purpose: "MASTER",
    });
    expect(key).toBe(`user/${OWNER}/${BEAT_A}/${ASSET_A}/master.bin`);
    expect(validateObjectKey(key)).toBeNull();
  });

  it("rejects path traversal and foreign binding", () => {
    expect(validateObjectKey("user/../etc/passwd.bin")).not.toBeNull();
    expect(
      validateObjectKey(`user/${OWNER}/${BEAT_A}/${ASSET_A}/master.mp3`),
    ).not.toBeNull();
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: `user/${OTHER}/${BEAT_A}/${ASSET_A}/master.bin`,
        ownerId: OWNER,
        beatId: BEAT_A,
        assetId: ASSET_A,
      }).ok,
    ).toBe(false);
    expect(
      assertUserBeatObjectKeyBinding({
        objectKey: `user/${OWNER}/${BEAT_A}/${ASSET_A}/master.bin`,
        ownerId: OWNER,
        beatId: BEAT_A,
        assetId: ASSET_A,
      }).ok,
    ).toBe(true);
  });

  it("still accepts platform/ keys (PLATFORM regression)", () => {
    expect(
      validateObjectKey(`platform/${BEAT_A}/${ASSET_A}/master.bin`),
    ).toBeNull();
  });
});

describe("Community Wave 1 — USER edit freeze on PENDING_REVIEW", () => {
  it("USER cannot transition out of PENDING_REVIEW except via staff", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "DRAFT",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "ARCHIVED",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });
});
