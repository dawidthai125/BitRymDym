import { describe, expect, it } from "vitest";

import { evaluateQueueHealth } from "@/lib/audio/queue-health";

const NOW = Date.parse("2026-11-22T12:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

describe("evaluateQueueHealth", () => {
  it("ok when empty", () => {
    expect(evaluateQueueHealth([], [], NOW).ok).toBe(true);
  });
  it("fresh jobs are fine", () => {
    const h = evaluateQueueHealth(
      [{ status: "QUEUED", queuedAt: ago(2), timeoutAt: null }, { status: "RUNNING", queuedAt: ago(5), timeoutAt: ago(-3) }],
      [{ status: "queued", createdAt: ago(5), startedAt: null, progressAt: null }, { status: "running", createdAt: ago(40), startedAt: ago(40), progressAt: ago(1) }],
      NOW,
    );
    expect(h.ok).toBe(true);
    expect(h.render).toMatchObject({ queued: 1, running: 1, oldestQueuedSec: 120 });
  });
  it("flags a waiting export, a dead running export and a silent master", () => {
    const h = evaluateQueueHealth(
      [{ status: "QUEUED", queuedAt: ago(20), timeoutAt: null }, { status: "RUNNING", queuedAt: ago(40), timeoutAt: ago(15) }],
      [{ status: "queued", createdAt: ago(45), startedAt: null, progressAt: null }, { status: "running", createdAt: ago(60), startedAt: ago(50), progressAt: ago(35) }],
      NOW,
    );
    expect(h.ok).toBe(false);
    expect(h.render).toMatchObject({ stuckQueued: 1, stuckRunning: 1 });
    expect(h.master).toMatchObject({ stuckQueued: 1, stuckRunning: 1 });
  });
});

describe("listen copy health", () => {
  it("flags a copy waiting over 3 min or working over 5 min", async () => {
    const { evaluateListenCopyHealth } = await import("@/lib/audio/queue-health");
    const now = Date.parse("2026-11-22T20:00:00Z");
    const ago = (ms: number) => new Date(now - ms).toISOString();
    const h = evaluateListenCopyHealth([
      { status: "pending", createdAt: ago(30_000), claimedAt: null },
      { status: "pending", createdAt: ago(4 * 60_000), claimedAt: null },
      { status: "working", createdAt: ago(60_000), claimedAt: ago(6 * 60_000) },
      { status: "working", createdAt: ago(60_000), claimedAt: ago(20_000) },
    ], now);
    expect(h).toEqual({ pending: 2, working: 2, stuck: 2, oldestPendingSec: 240 });
  });
});
