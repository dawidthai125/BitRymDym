import { describe, expect, it } from "vitest";

import {
  canAnonUseBeat,
  canDownloadBeatByOwnerChoice,
  canUseBeatInStudio,
  canViewBeat,
  isBeatInPublicCatalogue,
  type BeatUsageSubject,
} from "@/lib/beats/usage/beat-usage-policy";

const OWNER = "owner-1";
const OTHER = "user-2";

function beat(over: Partial<BeatUsageSubject> = {}): BeatUsageSubject {
  return {
    status: "PUBLISHED",
    ownershipType: "USER",
    ownerId: OWNER,
    visibility: "public",
    allowDownload: true,
    allowStudioUse: true,
    ...over,
  };
}

describe("beat usage policy (user beats 2026-10-30)", () => {
  it("defaults (pre-migration rows: null settings) behave as public + download + studio ON", () => {
    const legacy = beat({ visibility: null, allowDownload: null, allowStudioUse: null });
    expect(isBeatInPublicCatalogue(legacy)).toBe(true);
    expect(canDownloadBeatByOwnerChoice(legacy, { userId: OTHER }).allowed).toBe(true);
    expect(canUseBeatInStudio(legacy, { userId: OTHER }).allowed).toBe(true);
    expect(canAnonUseBeat(legacy).allowed).toBe(true);
  });

  it("private beat: hidden from catalogue, visible to owner / staff / grantee only", () => {
    const b = beat({ visibility: "private" });
    expect(isBeatInPublicCatalogue(b)).toBe(false);
    expect(canViewBeat(b, { userId: OWNER }).allowed).toBe(true);
    expect(canViewBeat(b, { userId: OTHER, isStaff: true }).allowed).toBe(true);
    expect(canViewBeat(b, { userId: OTHER, hasActiveGrant: true }).allowed).toBe(true);
    expect(canViewBeat(b, { userId: OTHER })).toEqual({ allowed: false, reason: "PRIVATE" });
    expect(canViewBeat(b, { userId: null })).toEqual({ allowed: false, reason: "PRIVATE" });
    expect(canAnonUseBeat(b).allowed).toBe(false);
  });

  it("listen-only: download denied to others, owner and staff keep it, a grant does not override", () => {
    const b = beat({ allowDownload: false });
    expect(canDownloadBeatByOwnerChoice(b, { userId: OTHER })).toEqual({
      allowed: false,
      reason: "DOWNLOAD_DISABLED",
    });
    expect(canDownloadBeatByOwnerChoice(b, { userId: OTHER, hasActiveGrant: true }).allowed).toBe(false);
    expect(canDownloadBeatByOwnerChoice(b, { userId: OWNER }).allowed).toBe(true);
    expect(canDownloadBeatByOwnerChoice(b, { userId: OTHER, isStaff: true }).allowed).toBe(true);
  });

  it("studio use OFF: others blocked (incl. anonymous), owner and grantees allowed", () => {
    const b = beat({ allowStudioUse: false });
    expect(canUseBeatInStudio(b, { userId: OTHER })).toEqual({
      allowed: false,
      reason: "STUDIO_USE_DISABLED",
    });
    expect(canAnonUseBeat(b).allowed).toBe(false);
    expect(canUseBeatInStudio(b, { userId: OWNER }).allowed).toBe(true);
    expect(canUseBeatInStudio(b, { userId: OTHER, hasActiveGrant: true }).allowed).toBe(true);
  });

  it("unpublished beats: only the owner may use them", () => {
    for (const status of ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"]) {
      const b = beat({ status });
      expect(canUseBeatInStudio(b, { userId: OWNER }).allowed).toBe(true);
      expect(canUseBeatInStudio(b, { userId: OTHER, hasActiveGrant: true })).toEqual({
        allowed: false,
        reason: "NOT_PUBLISHED",
      });
      expect(canViewBeat(b, { userId: OTHER }).allowed).toBe(false);
    }
  });

  it("PLATFORM beats ignore owner settings (always public; download deny lives elsewhere)", () => {
    const p = beat({ ownershipType: "PLATFORM", ownerId: null, visibility: "private", allowStudioUse: false });
    expect(isBeatInPublicCatalogue(p)).toBe(true);
    expect(canUseBeatInStudio(p, { userId: OTHER }).allowed).toBe(true);
    expect(canAnonUseBeat(p).allowed).toBe(true);
  });
});
