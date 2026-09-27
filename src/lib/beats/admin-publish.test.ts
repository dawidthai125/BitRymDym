import { describe, expect, it } from "vitest";

import {
  assertPlatformPublishHardGate,
  canAdminPublishFromUi,
  getAdminPublishGate,
  isActiveMasterReadyForBeat,
  PUBLISH_REQUIRES_READY_MASTER,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import { hasPermission } from "@/lib/auth/permissions";
import { canTransitionStatus, validateBeatInput } from "@/lib/beats/validation";

const BEAT_A = "beat-aaa-aaa-aaa-aaaaaaaaaaaa";
const BEAT_B = "beat-bbb-bbb-bbb-bbbbbbbbbbbb";
const ASSET_A = "asset-aaa-aaa-aaa-aaaaaaaaaa";
const ASSET_B = "asset-bbb-bbb-bbb-bbbbbbbbbb";

function asset(
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

describe("admin publish UI gate (Phase 1.7 — preserved)", () => {
  it("blocks publish without READY MASTER", () => {
    const gate = getAdminPublishGate({
      status: "DRAFT",
      activeMasterReady: false,
    });
    expect(gate.enabled).toBe(false);
    expect(gate.blockedReason).toBe(PUBLISH_REQUIRES_READY_MASTER);
    expect(
      canAdminPublishFromUi({ status: "DRAFT", activeMasterReady: false }),
    ).toBe(false);
  });

  it("enables publish for DRAFT with READY MASTER", () => {
    const gate = getAdminPublishGate({
      status: "DRAFT",
      activeMasterReady: true,
    });
    expect(gate.enabled).toBe(true);
    expect(gate.blockedReason).toBeNull();
  });

  it("blocks publish when already PUBLISHED", () => {
    const gate = getAdminPublishGate({
      status: "PUBLISHED",
      activeMasterReady: true,
    });
    expect(gate.enabled).toBe(false);
  });

  it("blocks ARCHIVED even with READY MASTER", () => {
    expect(
      canAdminPublishFromUi({
        status: "ARCHIVED",
        activeMasterReady: true,
      }),
    ).toBe(false);
  });
});

describe("server publish hard gate (GAP-PUBLISH-READY CLOSED)", () => {
  it("A: PLATFORM + MASTER READY → PASS", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [asset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate).toEqual({ ok: true, readyMasterAssetId: ASSET_A });
  });

  it("B: PLATFORM + brak MASTER → REJECT", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [],
    });
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe(PUBLISH_REQUIRES_READY_MASTER);
    }
  });

  it("C: PLATFORM + MASTER PENDING_UPLOAD → REJECT", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [
        asset({ id: ASSET_A, beatId: BEAT_A, status: "PENDING_UPLOAD" }),
      ],
    });
    expect(gate.ok).toBe(false);
  });

  it("D: PLATFORM + MASTER FAILED → REJECT", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [asset({ id: ASSET_A, beatId: BEAT_A, status: "FAILED" })],
    });
    expect(gate.ok).toBe(false);
  });

  it("E: PLATFORM + inactive MASTER READY → REJECT", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      assetsForBeat: [
        asset({ id: ASSET_A, beatId: BEAT_A, isActive: false, status: "READY" }),
      ],
    });
    expect(gate.ok).toBe(false);
  });

  it("F: READY asset belonging to another beat → REJECT", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "DRAFT",
      // Caller must only load assets for beat A; if a foreign asset leaks in,
      // beatId mismatch still rejects.
      assetsForBeat: [asset({ id: ASSET_B, beatId: BEAT_B })],
    });
    expect(gate.ok).toBe(false);
    expect(
      isActiveMasterReadyForBeat({
        beatId: BEAT_A,
        asset: asset({ id: ASSET_B, beatId: BEAT_B }),
      }),
    ).toBe(false);
  });

  it("rejects USER ownership even with READY MASTER", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "USER",
      status: "DRAFT",
      assetsForBeat: [asset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate.ok).toBe(false);
  });

  it("rejects non-DRAFT status at hard gate", () => {
    const gate = assertPlatformPublishHardGate({
      beatId: BEAT_A,
      ownershipType: "PLATFORM",
      status: "ARCHIVED",
      assetsForBeat: [asset({ id: ASSET_A, beatId: BEAT_A })],
    });
    expect(gate.ok).toBe(false);
  });

  it("I: valid READY MASTER still passes (existing happy path)", () => {
    expect(
      assertPlatformPublishHardGate({
        beatId: BEAT_A,
        ownershipType: "PLATFORM",
        status: "DRAFT",
        assetsForBeat: [
          asset({ id: ASSET_A, beatId: BEAT_A, status: "FAILED", isActive: false }),
          asset({ id: "asset-ready", beatId: BEAT_A }),
        ],
      }),
    ).toEqual({ ok: true, readyMasterAssetId: "asset-ready" });
  });
});

describe("Phase 1.7 PLATFORM ownership + AuthZ matrix (pure)", () => {
  it("PLATFORM create payload requires ownerId null", () => {
    const ok = validateBeatInput({
      ownershipType: "PLATFORM",
      ownerId: null,
      title: "Ops Beat",
      bpm: 140,
      durationSeconds: 120,
      status: "DRAFT",
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.ownerId).toBeNull();
      expect(ok.value.ownershipType).toBe("PLATFORM");
    }

    const bad = validateBeatInput({
      ownershipType: "PLATFORM",
      ownerId: "should-not-own",
      title: "Ops Beat",
      bpm: 140,
      durationSeconds: 120,
    });
    expect(bad.ok).toBe(false);
  });

  it("G: USER lacks publish transition; H: missing beats.edit permission", () => {
    expect(hasPermission([], "beats.edit")).toBe(false);
    expect(hasPermission(["beats.approve", "beats.reject"], "beats.edit")).toBe(
      false,
    );
    expect(hasPermission(["beats.create", "beats.edit"], "beats.edit")).toBe(
      true,
    );
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "USER" }),
    ).toBe(false);
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "MODERATOR",
      }),
    ).toBe(false);
  });

  it("ADMIN lifecycle allows DRAFT→PUBLISHED; USER cannot publish", () => {
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "ADMIN" }),
    ).toBe(true);
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "USER" }),
    ).toBe(false);
  });
});
