import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import {
  assertTakeRecordAccess,
  assertAnonTakeRecordAccess,
  TakeAuthzError,
} from "@/lib/takes/authz";
import {
  getSamplePolicy,
  isTakeActivelyReady,
  isTakeExpired,
  recordingModeForMaxSeconds,
  validateAdminRecordingDurationSeconds,
} from "@/lib/takes/entitlement";
import { assertOwnReadyTakeAccess } from "@/lib/takes/take-access";

function ctx(): AuthContext {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    userId,
    email: "a@test",
    profile: {
      id: userId,
      displayName: "A",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

describe("Recording Wave 4 — Sample Policy (Premium Tier)", () => {
  it("FREE max is 30 even when beat is longer", () => {
    expect(
      getSamplePolicy({
        actor: "FREE",
        beatDurationSeconds: 240,
      }).maxRecordingSeconds,
    ).toBe(30);
    expect(
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 90 },
        premiumTier: "FREE",
      }).maxRecordingSeconds,
    ).toBe(30);
  });

  it("FREE uses shorter beat when beat < 30", () => {
    expect(
      getSamplePolicy({
        actor: "FREE",
        beatDurationSeconds: 12,
      }).maxRecordingSeconds,
    ).toBe(12);
  });

  it("SILVER / GOLD are MIN(beat, tier cap)", () => {
    expect(
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 60 },
        premiumTier: "SILVER",
      }).maxRecordingSeconds,
    ).toBe(60);
    expect(
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 240 },
        premiumTier: "SILVER",
      }).maxRecordingSeconds,
    ).toBe(120);
    expect(
      assertTakeRecordAccess({
        context: ctx(),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 300 },
        premiumTier: "GOLD",
      }).maxRecordingSeconds,
    ).toBe(180);
  });

  it("Account Level does not raise FREE sample policy", () => {
    const legendCtx = ctx();
    legendCtx.profile.accountLevel = "LEGEND_RAPPER";
    expect(
      assertTakeRecordAccess({
        context: legendCtx,
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 240 },
        premiumTier: "FREE",
      }).maxRecordingSeconds,
    ).toBe(30);
  });

  it("recording mode maps QUICK vs FULL from max seconds", () => {
    expect(recordingModeForMaxSeconds(30)).toBe("QUICK");
    expect(recordingModeForMaxSeconds(31)).toBe("FULL");
  });

  it("ANONYMOUS is 15s", () => {
    expect(
      assertAnonTakeRecordAccess({
        tokenHash: "a".repeat(64),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 90 },
      }).maxRecordingSeconds,
    ).toBe(15);
  });
});

describe("Recording Wave 4 — retention / active READY helpers", () => {
  it("maps retention via Sample Policy TTL", () => {
    expect(getSamplePolicy({ actor: "FREE", beatDurationSeconds: 60 }).ttlSeconds).toBe(
      12 * 60 * 60,
    );
    expect(getSamplePolicy({ actor: "SILVER", beatDurationSeconds: 60 }).ttlSeconds).toBe(
      60 * 60 * 60,
    );
    expect(getSamplePolicy({ actor: "GOLD", beatDurationSeconds: 60 }).ttlSeconds).toBe(
      84 * 60 * 60,
    );
  });

  it("detects expiry and active READY", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isTakeExpired({ expiresAt: past })).toBe(true);
    expect(isTakeExpired({ expiresAt: future })).toBe(false);
    expect(
      isTakeActivelyReady({
        status: "READY",
        deletedAt: null,
        expiresAt: future,
      }),
    ).toBe(true);
  });
});

describe("Recording Wave 4 — anti-abuse caps (Sample Policy)", () => {
  it("exposes P1 caps per Premium Tier", () => {
    expect(getSamplePolicy({ actor: "FREE", beatDurationSeconds: 60 })).toMatchObject({
      activeReadyCap: 3,
      dailySessionLimit: 3,
    });
    expect(getSamplePolicy({ actor: "SILVER", beatDurationSeconds: 60 })).toMatchObject({
      activeReadyCap: 7,
      dailySessionLimit: 7,
    });
    expect(getSamplePolicy({ actor: "GOLD", beatDurationSeconds: 60 })).toMatchObject({
      activeReadyCap: 10,
      dailySessionLimit: 10,
    });
  });
});

describe("Recording Wave 4 — signed download AuthZ gate (unchanged P1)", () => {
  const base = {
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    beat_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    status: "READY",
    object_key:
      "user/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/takes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/mic.bin",
    storage_bucket: "take-audio",
    content_type: "audio/webm",
    duration_seconds: 10,
    byte_size: 1000,
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    deleted_at: null as string | null,
  };

  it("allows owner READY not-expired (P4 download gate not wired)", () => {
    expect(() =>
      assertOwnReadyTakeAccess({
        take: base,
        userId: base.owner_id!,
        purpose: "download",
      }),
    ).not.toThrow();
  });

  it("denies foreign owner (IDOR)", () => {
    expect(() =>
      assertOwnReadyTakeAccess({
        take: base,
        userId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        purpose: "download",
      }),
    ).toThrow(AuthError);
  });

  it("P4 enforces GOLD canDownloadOwnTake + daily C on take-download", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/takes/take-download.ts"),
      "utf8",
    );
    expect(src).toMatch(/canDownloadOwnTake/);
    expect(src).toMatch(/GOLD|canDownloadOwnTakeRaw/);
    expect(src).toMatch(/take_download_events|recordOwnTakeRawDownloadEvent/);
  });
});

describe("Admin duration validation (pure)", () => {
  it("rejects out of range", () => {
    expect(validateAdminRecordingDurationSeconds(181)).not.toBeNull();
    expect(validateAdminRecordingDurationSeconds(0)).not.toBeNull();
    expect(validateAdminRecordingDurationSeconds(60)).toBeNull();
  });
});

describe("AuthZ requires premiumTier (no Account Level duration)", () => {
  it("anonymous record remains DENY on auth path", () => {
    expect(() =>
      assertTakeRecordAccess({
        context: { ...ctx(), userId: "" as unknown as string },
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 30 },
        premiumTier: "FREE",
      }),
    ).toThrow(TakeAuthzError);
  });
});
