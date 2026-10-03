import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import { AuthError } from "@/lib/auth/session";
import {
  assertTakeRecordAccess,
  TakeAuthzError,
} from "@/lib/takes/authz";
import {
  antiAbuseCapsForAccountLevel,
  computeRecordingMaxSeconds,
  isTakeActivelyReady,
  isTakeExpired,
  recordingModeForMaxSeconds,
  retentionSecondsForAccountLevel,
} from "@/lib/takes/entitlement";
import { assertOwnReadyTakeAccess } from "@/lib/takes/take-access";

function ctx(
  level: AuthContext["profile"]["accountLevel"],
): AuthContext {
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  return {
    userId,
    email: "a@test",
    profile: {
      id: userId,
      displayName: "A",
      userNumber: null,
      role: "USER",
      accountLevel: level,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

describe("Recording Wave 4 — entitlement", () => {
  it("BEGINNER max is 30 even when beat is longer", () => {
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "BEGINNER_RAPPER",
        beatDurationSeconds: 240,
      }),
    ).toBe(30);
    expect(
      assertTakeRecordAccess({
        context: ctx("BEGINNER_RAPPER"),
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 90 },
      }).maxRecordingSeconds,
    ).toBe(30);
  });

  it("BEGINNER uses shorter beat when beat < 30", () => {
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "BEGINNER_RAPPER",
        beatDurationSeconds: 12,
      }),
    ).toBe(12);
  });

  it("PRO / LEGEND are MIN(beat, 180)", () => {
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "PRO_RAPPER",
        beatDurationSeconds: 60,
      }),
    ).toBe(60);
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "PRO_RAPPER",
        beatDurationSeconds: 240,
      }),
    ).toBe(180);
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "LEGEND_RAPPER",
        beatDurationSeconds: 90,
      }),
    ).toBe(90);
    expect(
      computeRecordingMaxSeconds({
        accountLevel: "LEGEND_RAPPER",
        beatDurationSeconds: 300,
      }),
    ).toBe(180);
  });

  it("recording mode maps QUICK vs FULL from max seconds", () => {
    expect(recordingModeForMaxSeconds(30)).toBe("QUICK");
    expect(recordingModeForMaxSeconds(31)).toBe("FULL");
  });
});

describe("Recording Wave 4 — retention", () => {
  it("maps retention seconds per account level", () => {
    expect(retentionSecondsForAccountLevel("BEGINNER_RAPPER")).toBe(
      24 * 60 * 60,
    );
    expect(retentionSecondsForAccountLevel("PRO_RAPPER")).toBe(
      10 * 24 * 60 * 60,
    );
    expect(retentionSecondsForAccountLevel("LEGEND_RAPPER")).toBe(
      30 * 24 * 60 * 60,
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
    expect(
      isTakeActivelyReady({
        status: "READY",
        deletedAt: null,
        expiresAt: past,
      }),
    ).toBe(false);
    expect(
      isTakeActivelyReady({
        status: "READY",
        deletedAt: new Date().toISOString(),
        expiresAt: future,
      }),
    ).toBe(false);
    expect(
      isTakeActivelyReady({
        status: "EXPIRED",
        deletedAt: null,
        expiresAt: past,
      }),
    ).toBe(false);
  });
});

describe("Recording Wave 4 — anti-abuse caps (policy)", () => {
  it("exposes design-freeze caps per level", () => {
    expect(antiAbuseCapsForAccountLevel("BEGINNER_RAPPER")).toEqual({
      maxActiveReady: 3,
      maxSessionsPerUtcDay: 10,
    });
    expect(antiAbuseCapsForAccountLevel("PRO_RAPPER")).toEqual({
      maxActiveReady: 10,
      maxSessionsPerUtcDay: 30,
    });
    expect(antiAbuseCapsForAccountLevel("LEGEND_RAPPER")).toEqual({
      maxActiveReady: 20,
      maxSessionsPerUtcDay: 60,
    });
  });
});

describe("Recording Wave 4 — signed download AuthZ gate", () => {
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

  it("allows owner READY not-expired", () => {
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

  it("denies expired / deleted / non-READY", () => {
    expect(() =>
      assertOwnReadyTakeAccess({
        take: {
          ...base,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
        userId: base.owner_id!,
        purpose: "download",
      }),
    ).toThrow(/expired/i);

    expect(() =>
      assertOwnReadyTakeAccess({
        take: { ...base, deleted_at: new Date().toISOString() },
        userId: base.owner_id!,
        purpose: "preview",
      }),
    ).toThrow(/deleted/i);

    expect(() =>
      assertOwnReadyTakeAccess({
        take: { ...base, status: "PENDING_UPLOAD" },
        userId: base.owner_id!,
        purpose: "download",
      }),
    ).toThrow(/READY/i);

    expect(() =>
      assertOwnReadyTakeAccess({
        take: { ...base, status: "FAILED" },
        userId: base.owner_id!,
        purpose: "download",
      }),
    ).toThrow(/READY/i);
  });

  it("anonymous record remains DENY", () => {
    expect(() =>
      assertTakeRecordAccess({
        context: { ...ctx("BEGINNER_RAPPER"), userId: "" as unknown as string },
        beat: { id: "b", status: "PUBLISHED", durationSeconds: 30 },
      }),
    ).toThrow(TakeAuthzError);
  });
});
