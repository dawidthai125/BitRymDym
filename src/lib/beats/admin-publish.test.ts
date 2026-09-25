import { describe, expect, it } from "vitest";

import {
  canAdminPublishFromUi,
  getAdminPublishGate,
} from "@/lib/beats/admin-publish";
import { validateBeatInput } from "@/lib/beats/validation";
import { hasPermission } from "@/lib/auth/permissions";
import { canTransitionStatus } from "@/lib/beats/validation";

describe("admin publish UI gate (Phase 1.7)", () => {
  it("blocks publish without READY MASTER", () => {
    const gate = getAdminPublishGate({
      status: "DRAFT",
      activeMasterReady: false,
    });
    expect(gate.enabled).toBe(false);
    expect(gate.blockedReason).toMatch(/READY/);
    expect(gate.blockedReason).toMatch(/GAP-PUBLISH-READY/);
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

  it("blocks FAILED / missing audio as not READY", () => {
    expect(
      getAdminPublishGate({ status: "DRAFT", activeMasterReady: false })
        .enabled,
    ).toBe(false);
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

  it("USER lacks beats.create / beats.edit; MODERATOR lacks create/edit", () => {
    expect(hasPermission([], "beats.create")).toBe(false);
    expect(hasPermission(["beats.approve", "beats.reject"], "beats.create")).toBe(
      false,
    );
    expect(hasPermission(["beats.approve", "beats.reject"], "beats.edit")).toBe(
      false,
    );
    expect(hasPermission(["beats.create", "beats.edit"], "beats.create")).toBe(
      true,
    );
  });

  it("ADMIN lifecycle allows DRAFT→PUBLISHED; USER cannot publish", () => {
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "ADMIN" }),
    ).toBe(true);
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
});
