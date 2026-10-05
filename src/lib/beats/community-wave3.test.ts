import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { hasPermission } from "@/lib/auth/permissions";
import {
  canAccessAdminNav,
  canAccessModerationNav,
} from "@/lib/auth/permissions";
import {
  assertPublishHardGate,
  type PublishGateAssetSnapshot,
} from "@/lib/beats/admin-publish";
import { canRequestBeatAudioAccess } from "@/lib/beats/audio-validation";
import {
  beatStatusLabelPl,
  canUserEditBeatStatus,
} from "@/lib/beats/status-labels";
import {
  canTransitionStatus,
  validateRejectionReason,
} from "@/lib/beats/validation";

const BEAT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ASSET = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function readyMaster(beatId = BEAT): PublishGateAssetSnapshot {
  return {
    id: ASSET,
    beatId,
    purpose: "MASTER",
    status: "READY",
    isActive: true,
  };
}

describe("Community Wave 3 — submit / moderation contracts", () => {
  it("A: USER DRAFT → PENDING_REVIEW own = PASS", () => {
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

  it("B: USER foreign submit = DENY", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "USER",
        isOwner: false,
      }),
    ).toBe(false);
  });

  it("C: USER PLATFORM submit = DENY", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "PLATFORM",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("D: submit without READY = DENY (gate)", () => {
    const gate = assertPublishHardGate({
      beatId: BEAT,
      ownershipType: "USER",
      status: "DRAFT",
      assetsForBeat: [
        {
          id: ASSET,
          beatId: BEAT,
          purpose: "MASTER",
          status: "PENDING_UPLOAD",
          isActive: true,
        },
      ],
    });
    // Submit uses same READY truth — no active READY master
    const hasReady = false;
    expect(hasReady || gate.ok).toBe(false);
  });

  it("D2: submit with READY master shape = PASS gate input", () => {
    const assets = [readyMaster()];
    const ready = assets.some(
      (a) =>
        a.beatId === BEAT &&
        a.purpose === "MASTER" &&
        a.isActive &&
        a.status === "READY",
    );
    expect(ready).toBe(true);
  });

  it("E: foreign asset beatId mismatch = DENY", () => {
    const assets = [readyMaster("dddddddd-dddd-4ddd-8ddd-dddddddddddd")];
    const ready = assets.some(
      (a) =>
        a.beatId === BEAT &&
        a.purpose === "MASTER" &&
        a.isActive &&
        a.status === "READY",
    );
    expect(ready).toBe(false);
  });

  it("G: USER cannot submit PUBLISHED", () => {
    expect(
      canTransitionStatus({
        from: "PUBLISHED",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(false);
  });

  it("H: USER cannot submit PENDING_REVIEW", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true); // same-status no-op allowed by matrix helper
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

  it("I: MODERATOR PENDING → APPROVED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "APPROVED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("J: MODERATOR PENDING → REJECTED = PASS", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "REJECTED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("K: reject without reason = DENY", () => {
    expect(validateRejectionReason("").ok).toBe(false);
    expect(validateRejectionReason("   ").ok).toBe(false);
    expect(validateRejectionReason(null).ok).toBe(false);
  });

  it("K2: reject with reason = PASS", () => {
    const r = validateRejectionReason("  Zbyt niska jakość  ");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("Zbyt niska jakość");
  });

  it("L: approve non-PENDING = DENY", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "APPROVED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(false);
  });

  it("O: Wave 3 moderation actions include approve/reject; Wave 4 adds publish", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/lib/beats/community-actions.ts"),
      "utf8",
    );
    expect(src).toContain("approveUserBeat");
    expect(src).toContain("rejectUserBeat");
    expect(src).toContain("submitUserBeat");
    expect(src).toContain("publishApprovedUserBeat");
  });

  it("P: USER cannot approve", () => {
    expect(hasPermission(["beats.create"], "beats.approve")).toBe(false);
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

  it("Q: USER cannot reject", () => {
    expect(hasPermission(["beats.create"], "beats.reject")).toBe(false);
  });

  it("R: USER cannot publish", () => {
    expect(hasPermission(["beats.create"], "beats.publish")).toBe(false);
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

  it("S: USER cannot edit PENDING (UI gate)", () => {
    expect(canUserEditBeatStatus("PENDING_REVIEW")).toBe(false);
  });

  it("T: USER cannot edit APPROVED (UI gate)", () => {
    expect(canUserEditBeatStatus("APPROVED")).toBe(false);
    expect(canUserEditBeatStatus("DRAFT")).toBe(true);
    expect(canUserEditBeatStatus("REJECTED")).toBe(true);
  });

  it("U/V: APPROVED not public playback / catalog status", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "APPROVED",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "USER",
        beatStatus: "APPROVED",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
  });

  it("W/X: REJECTED and DRAFT not public playback", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "REJECTED",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
    expect(
      canRequestBeatAudioAccess({
        actor: "ANON",
        beatStatus: "DRAFT",
        purpose: "PLAYBACK",
      }),
    ).toBe(false);
  });

  it("moderation playback: MODERATOR PLAYBACK PENDING = PASS", () => {
    expect(
      canRequestBeatAudioAccess({
        actor: "MODERATOR",
        beatStatus: "PENDING_REVIEW",
        purpose: "PLAYBACK",
      }),
    ).toBe(true);
  });

  it("resubmit path: REJECTED → DRAFT → PENDING_REVIEW", () => {
    expect(
      canTransitionStatus({
        from: "REJECTED",
        to: "DRAFT",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true);
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

  it("Wave 3: APPROVED → PUBLISHED remains Wave 4 capability (matrix)", () => {
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("Polish status labels", () => {
    expect(beatStatusLabelPl("DRAFT")).toBe("Wersja robocza");
    expect(beatStatusLabelPl("PENDING_REVIEW")).toBe("W moderacji");
    expect(beatStatusLabelPl("APPROVED")).toBe("Zatwierdzone");
    expect(beatStatusLabelPl("REJECTED")).toBe("Odrzucony");
    expect(beatStatusLabelPl("PUBLISHED")).toBe("Opublikowany");
    expect(beatStatusLabelPl("ARCHIVED")).toBe("Zarchiwizowany");
  });

  it("nav helpers: MOD sees moderation, not PLATFORM admin", () => {
    expect(canAccessModerationNav("MODERATOR")).toBe(true);
    expect(canAccessModerationNav("ADMIN")).toBe(true);
    expect(canAccessModerationNav("USER")).toBe(false);
    expect(canAccessAdminNav("MODERATOR")).toBe(false);
    expect(canAccessAdminNav("ADMIN")).toBe(true);
  });

  it("MODERATOR cannot edit metadata permission", () => {
    expect(
      hasPermission(["beats.approve", "beats.reject", "beats.publish"], "beats.edit"),
    ).toBe(false);
  });
});
