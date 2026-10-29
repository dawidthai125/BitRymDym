/**
 * GO-PREMIUM-28 — HTTP route unit tests (mocked scheduler; no live cleanup).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runBatch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/premium/premium-retention-scheduler", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/premium/premium-retention-scheduler")
  >("@/lib/premium/premium-retention-scheduler");
  return {
    ...actual,
    runPremiumRetentionCleanupBatch: runBatch,
  };
});

import { GET } from "@/app/api/cron/premium-retention/route";
import { PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV } from "@/lib/premium/premium-retention-cron-auth";

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe("GET /api/cron/premium-retention", () => {
  const prevSecret = process.env.CRON_SECRET;
  const prevActive = process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV];

  beforeEach(() => {
    runBatch.mockReset();
    runBatch.mockResolvedValue({
      runId: "test-run",
      mode: "dry-run",
      lockAcquired: true,
      lockScope: "process",
      fencingToken: null,
      startedAt: "t0",
      finishedAt: "t1",
      durationMs: 1,
      limit: 50,
      scanned: 0,
      qualified: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      purgeComplete: 0,
      purgeIncomplete: 0,
      alreadyExpired: 0,
      truncated: false,
      errorClass: null,
      leaseReleaseErrorClass: null,
      works: [],
    });
    process.env.CRON_SECRET = "test-cron-secret";
    delete process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV];
  });

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = prevSecret;
    if (prevActive === undefined) {
      delete process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV];
    } else {
      process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV] = prevActive;
    }
    delete process.env.PREMIUM_RETENTION_WORK_PAGE_SIZE;
    delete process.env.PREMIUM_RETENTION_WORK_MAX_KEYS;
    delete process.env.PREMIUM_RETENTION_WORK_DEADLINE_MS;
    delete process.env.PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS;
  });

  it("503 when CRON_SECRET missing", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention", {
        authorization: "Bearer x",
      }),
    );
    expect(res.status).toBe(503);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("401 on bad secret", async () => {
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention", {
        authorization: "Bearer nope",
      }),
    );
    expect(res.status).toBe(401);
    expect(runBatch).not.toHaveBeenCalled();
  });

  it("200 dry-run by default with valid secret", async () => {
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention", {
        authorization: "Bearer test-cron-secret",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe("dry-run");
    expect(runBatch).toHaveBeenCalledWith({ mode: "dry-run" });
    expect(body).not.toHaveProperty("works");
  });

  it("forces dry-run when mode=active without kill-switch", async () => {
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention?mode=active", {
        authorization: "Bearer test-cron-secret",
      }),
    );
    expect(res.status).toBe(200);
    expect(runBatch).toHaveBeenCalledWith({ mode: "dry-run" });
  });

  it("passes active only with kill-switch + mode=active", async () => {
    process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV] = "1";
    runBatch.mockResolvedValueOnce({
      runId: "active-run",
      mode: "active",
      lockAcquired: true,
      lockScope: "process",
      startedAt: "t0",
      finishedAt: "t1",
      durationMs: 1,
      limit: 50,
      scanned: 0,
      qualified: 0,
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      purgeComplete: 0,
      purgeIncomplete: 0,
      alreadyExpired: 0,
      truncated: false,
      errorClass: null,
      works: [],
    });
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention?mode=active", {
        authorization: "Bearer test-cron-secret",
      }),
    );
    expect(res.status).toBe(200);
    expect(runBatch).toHaveBeenCalledWith({ mode: "active" });
    // GO-72 / OD-62-03 A: without complete env, route does not invent provisional
    // 50/25 — scheduler fail-closes with WORK_LIMITS_REQUIRED (and LEASE_TTL_REQUIRED).
    expect(runBatch.mock.calls[0]![0]).not.toHaveProperty("workLimits");
    expect(runBatch.mock.calls[0]![0]).not.toHaveProperty("leaseTtlSeconds");
    const body = await res.json();
    expect(body.mode).toBe("active");
  });

  it("active with complete workLimits env forwards finite limits only", async () => {
    process.env[PREMIUM_RETENTION_CLEANUP_ACTIVE_ENV] = "1";
    process.env.PREMIUM_RETENTION_WORK_PAGE_SIZE = "50";
    process.env.PREMIUM_RETENTION_WORK_MAX_KEYS = "25";
    process.env.PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS = "60000";
    const res = await GET(
      req("http://127.0.0.1/api/cron/premium-retention?mode=active", {
        authorization: "Bearer test-cron-secret",
      }),
    );
    expect(res.status).toBe(200);
    const arg = runBatch.mock.calls[0]![0];
    expect(arg.mode).toBe("active");
    expect(arg.workLimits).toMatchObject({
      pageSize: 50,
      maxKeysPerWork: 25,
    });
    expect(Number.isFinite(arg.workLimits.deadlineMs)).toBe(true);
    expect(arg.workLimits.maxKeysPerWork).not.toBe(Number.POSITIVE_INFINITY);
    delete process.env.PREMIUM_RETENTION_WORK_PAGE_SIZE;
    delete process.env.PREMIUM_RETENTION_WORK_MAX_KEYS;
    delete process.env.PREMIUM_RETENTION_WORK_DEADLINE_DURATION_MS;
  });
});
