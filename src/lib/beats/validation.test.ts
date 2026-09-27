import { describe, expect, it } from "vitest";

import {
  canTransitionStatus,
  validateBeatInput,
} from "@/lib/beats/validation";
import { hasPermission, hasRole } from "@/lib/auth/permissions";

describe("beat validation", () => {
  const base = {
    ownershipType: "PLATFORM" as const,
    ownerId: null,
    title: "Night Drill",
    bpm: 140,
    durationSeconds: 120,
  };

  it("accepts valid platform beat", () => {
    const result = validateBeatInput(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("Night Drill");
      expect(result.value.bpm).toBe(140);
      expect(result.value.ownershipType).toBe("PLATFORM");
      expect(result.value.ownerId).toBeNull();
    }
  });

  it("trims title and enforces 1–200", () => {
    expect(validateBeatInput({ ...base, title: "  x  " }).ok).toBe(true);
    expect(validateBeatInput({ ...base, title: "" }).ok).toBe(false);
    expect(validateBeatInput({ ...base, title: "a".repeat(201) }).ok).toBe(
      false,
    );
  });

  it("requires numeric BPM 1–300", () => {
    expect(validateBeatInput({ ...base, bpm: 1 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, bpm: 300 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, bpm: 0 }).ok).toBe(false);
    expect(validateBeatInput({ ...base, bpm: 301 }).ok).toBe(false);
    expect(
      validateBeatInput({ ...base, bpm: 140.5 as unknown as number }),
    ).toMatchObject({ ok: false });
  });

  it("rejects NaN and ±Infinity BPM (cannot reach beats.bpm)", () => {
    expect(validateBeatInput({ ...base, bpm: Number.NaN }).ok).toBe(false);
    expect(
      validateBeatInput({ ...base, bpm: Number.POSITIVE_INFINITY }).ok,
    ).toBe(false);
    expect(
      validateBeatInput({ ...base, bpm: Number.NEGATIVE_INFINITY }).ok,
    ).toBe(false);
  });

  it("rejects string-like BPM values at type boundary", () => {
    const result = validateBeatInput({
      ...base,
      bpm: "142 BPM" as unknown as number,
    });
    expect(result.ok).toBe(false);
  });

  it("enforces duration 1–180 for all statuses", () => {
    expect(validateBeatInput({ ...base, durationSeconds: 1 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, durationSeconds: 180 }).ok).toBe(true);
    expect(validateBeatInput({ ...base, durationSeconds: 181 }).ok).toBe(false);
    expect(validateBeatInput({ ...base, durationSeconds: 0 }).ok).toBe(false);
  });

  it("limits tags count and length", () => {
    expect(
      validateBeatInput({
        ...base,
        tags: Array.from({ length: 31 }, (_, i) => `t${i}`),
      }).ok,
    ).toBe(false);
    expect(
      validateBeatInput({
        ...base,
        tags: ["a".repeat(41)],
      }).ok,
    ).toBe(false);
    expect(validateBeatInput({ ...base, tags: ["drill", "dark"] }).ok).toBe(
      true,
    );
  });

  it("enforces PLATFORM ownerId null and USER ownerId required", () => {
    expect(
      validateBeatInput({
        ...base,
        ownershipType: "PLATFORM",
        ownerId: "00000000-0000-0000-0000-000000000001",
      }).ok,
    ).toBe(false);
    expect(
      validateBeatInput({
        ...base,
        ownershipType: "USER",
        ownerId: null,
      }).ok,
    ).toBe(false);
    expect(
      validateBeatInput({
        ...base,
        ownershipType: "USER",
        ownerId: "00000000-0000-0000-0000-000000000001",
      }).ok,
    ).toBe(true);
  });
});

describe("beat status transitions (Phase 1.4)", () => {
  it("allows ADMIN DRAFT → PUBLISHED → ARCHIVED → DRAFT", () => {
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "ADMIN" }),
    ).toBe(true);
    expect(
      canTransitionStatus({ from: "PUBLISHED", to: "ARCHIVED", actor: "ADMIN" }),
    ).toBe(true);
    expect(
      canTransitionStatus({ from: "ARCHIVED", to: "DRAFT", actor: "ADMIN" }),
    ).toBe(true);
  });

  it("forbids PUBLISHED → DRAFT", () => {
    expect(
      canTransitionStatus({ from: "PUBLISHED", to: "DRAFT", actor: "ADMIN" }),
    ).toBe(false);
  });

  it("allows MODERATOR PENDING_REVIEW → APPROVED/REJECTED and USER APPROVED→PUBLISHED", () => {
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "APPROVED",
        actor: "MODERATOR",
      }),
    ).toBe(true);
    expect(
      canTransitionStatus({
        from: "PENDING_REVIEW",
        to: "REJECTED",
        actor: "MODERATOR",
      }),
    ).toBe(true);
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PUBLISHED",
        actor: "MODERATOR",
      }),
    ).toBe(false);
    expect(
      canTransitionStatus({
        from: "APPROVED",
        to: "PUBLISHED",
        actor: "MODERATOR",
        ownershipType: "USER",
      }),
    ).toBe(true);
  });

  it("allows USER own DRAFT→PENDING_REVIEW; denies USER publish", () => {
    expect(
      canTransitionStatus({
        from: "DRAFT",
        to: "PENDING_REVIEW",
        actor: "USER",
        ownershipType: "USER",
        isOwner: true,
      }),
    ).toBe(true);
    expect(
      canTransitionStatus({ from: "DRAFT", to: "PUBLISHED", actor: "USER" }),
    ).toBe(false);
  });
});

describe("beat authorization matrix (permissions catalog)", () => {
  const adminPerms = [
    "beats.create",
    "beats.edit",
    "beats.delete",
    "beats.approve",
    "beats.reject",
    "beats.publish",
  ] as const;
  const moderatorPerms = [
    "beats.approve",
    "beats.reject",
    "beats.publish",
  ] as const;
  const userPerms = ["beats.create"] as const;

  it("ADMIN has full beats.*", () => {
    for (const key of adminPerms) {
      expect(hasPermission(adminPerms, key)).toBe(true);
    }
    expect(hasRole("ADMIN", ["ADMIN"])).toBe(true);
  });

  it("MODERATOR has approve/reject/publish but not edit/create/delete", () => {
    expect(hasPermission(moderatorPerms, "beats.approve")).toBe(true);
    expect(hasPermission(moderatorPerms, "beats.reject")).toBe(true);
    expect(hasPermission(moderatorPerms, "beats.publish")).toBe(true);
    expect(hasPermission(moderatorPerms, "beats.edit")).toBe(false);
    expect(hasPermission(moderatorPerms, "beats.create")).toBe(false);
    expect(hasPermission(moderatorPerms, "beats.delete")).toBe(false);
  });

  it("USER has beats.create only among beats.*", () => {
    expect(hasPermission(userPerms, "beats.create")).toBe(true);
    expect(hasPermission(userPerms, "beats.edit")).toBe(false);
    expect(hasPermission(userPerms, "beats.publish")).toBe(false);
  });

  it("does not conflate account level with role permissions", () => {
    expect(hasRole("USER", ["ADMIN"])).toBe(false);
    expect(hasPermission(["beats.create"], "beats.create")).toBe(true);
  });
});
