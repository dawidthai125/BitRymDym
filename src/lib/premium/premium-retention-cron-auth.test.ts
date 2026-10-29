/**
 * GO-PREMIUM-28 — Cron auth + mode resolution unit tests (no network).
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizePremiumRetentionCron,
  isPremiumRetentionCleanupActiveEnabled,
  PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV,
  resolvePremiumRetentionCronMode,
} from "@/lib/premium/premium-retention-cron-auth";

describe("authorizePremiumRetentionCron", () => {
  it("returns 503 when CRON_SECRET is missing", () => {
    const result = authorizePremiumRetentionCron({
      authorizationHeader: "Bearer anything",
      env: {},
    });
    expect(result).toEqual({
      ok: false,
      status: 503,
      error: "CRON_SECRET is not configured.",
    });
  });

  it("returns 401 when Authorization header is missing", () => {
    const result = authorizePremiumRetentionCron({
      authorizationHeader: null,
      env: { CRON_SECRET: "s3cret" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns 401 when Bearer token is wrong", () => {
    const result = authorizePremiumRetentionCron({
      authorizationHeader: "Bearer wrong",
      env: { CRON_SECRET: "s3cret" },
    });
    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Unauthorized.",
    });
  });

  it("returns 401 when lengths differ (timing-safe path)", () => {
    const result = authorizePremiumRetentionCron({
      authorizationHeader: "Bearer ab",
      env: { CRON_SECRET: "abcd" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("accepts correct Bearer secret", () => {
    const result = authorizePremiumRetentionCron({
      authorizationHeader: "Bearer s3cret",
      env: { CRON_SECRET: "s3cret" },
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("resolvePremiumRetentionCronMode", () => {
  afterEach(() => {
    delete process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV];
  });

  it("defaults to dry-run", () => {
    expect(
      resolvePremiumRetentionCronMode({
        requestUrl: "http://127.0.0.1/api/cron/premium-retention",
        env: {},
      }),
    ).toBe("dry-run");
  });

  it("stays dry-run when client asks active but kill-switch unset", () => {
    expect(
      resolvePremiumRetentionCronMode({
        requestUrl:
          "http://127.0.0.1/api/cron/premium-retention?mode=active",
        env: {},
      }),
    ).toBe("dry-run");
  });

  it("allows active only with kill-switch and mode=active", () => {
    expect(
      resolvePremiumRetentionCronMode({
        requestUrl:
          "http://127.0.0.1/api/cron/premium-retention?mode=active",
        env: { [PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV]: "1" },
      }),
    ).toBe("active");
  });

  it("kill-switch alone without mode=active stays dry-run", () => {
    expect(
      resolvePremiumRetentionCronMode({
        requestUrl: "http://127.0.0.1/api/cron/premium-retention",
        env: { [PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV]: "1" },
      }),
    ).toBe("dry-run");
  });

  it("isPremiumRetentionCleanupActiveEnabled is strict equality to 1", () => {
    expect(isPremiumRetentionCleanupActiveEnabled({})).toBe(false);
    expect(
      isPremiumRetentionCleanupActiveEnabled({
        [PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV]: "true",
      }),
    ).toBe(false);
    expect(
      isPremiumRetentionCleanupActiveEnabled({
        [PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV]: "1",
      }),
    ).toBe(true);
  });
});
