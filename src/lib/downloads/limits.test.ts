import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_DAILY_DOWNLOAD_LIMIT,
  USER_DAILY_DOWNLOAD_LIMIT,
  ANON_DOWNLOAD_COOKIE_NAME,
} from "@/config/downloads";
import { hashAnonymousDownloadToken } from "@/lib/downloads/token-hash";
import {
  evaluateDailyLimit,
  isWithinUtcDay,
  utcDayWindowStart,
} from "@/lib/downloads/limits";

describe("download config SSOT", () => {
  it("locks anon=2 and user=4 defaults", () => {
    expect(ANONYMOUS_DAILY_DOWNLOAD_LIMIT).toBe(2);
    expect(USER_DAILY_DOWNLOAD_LIMIT).toBe(4);
    expect(ANON_DOWNLOAD_COOKIE_NAME).toBe("brd_dl_aid");
  });
});

describe("UTC calendar day window", () => {
  it("starts at midnight UTC", () => {
    const mid = new Date("2026-09-26T15:30:00.000Z");
    expect(utcDayWindowStart(mid).toISOString()).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });

  it("includes events from current UTC day only", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    expect(isWithinUtcDay("2026-09-26T00:00:00.000Z", now)).toBe(true);
    expect(isWithinUtcDay("2026-09-25T23:59:59.999Z", now)).toBe(false);
  });
});

describe("daily limit evaluation", () => {
  it("allows under anon limit and denies at 2", () => {
    expect(evaluateDailyLimit({ count: 0, limit: 2 }).allowed).toBe(true);
    expect(evaluateDailyLimit({ count: 1, limit: 2 }).allowed).toBe(true);
    expect(evaluateDailyLimit({ count: 2, limit: 2 })).toEqual({
      allowed: false,
      count: 2,
      limit: 2,
      remaining: 0,
    });
  });

  it("allows under user limit and denies at 4", () => {
    expect(evaluateDailyLimit({ count: 3, limit: 4 }).remaining).toBe(1);
    expect(evaluateDailyLimit({ count: 4, limit: 4 }).allowed).toBe(false);
  });
});

describe("anonymous token hashing", () => {
  it("stores SHA-256 hex only (never raw token shape)", () => {
    const token = "11111111-2222-3333-4444-555555555555";
    const hash = hashAnonymousDownloadToken(token);
    expect(hash).toBe(
      createHash("sha256").update(token, "utf8").digest("hex"),
    );
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain(token);
  });

  it("does not collide forged different tokens into same hash", () => {
    const a = hashAnonymousDownloadToken("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const b = hashAnonymousDownloadToken("ffffffff-1111-2222-3333-444444444444");
    expect(a).not.toBe(b);
  });
});
