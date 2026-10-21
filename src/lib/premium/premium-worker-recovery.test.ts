import { describe, expect, it } from "vitest";

import {
  classifyStuckRenderJob,
  isSfmExecutorKind,
} from "@/lib/premium/premium-worker-recovery";

describe("PREMIUM-06 worker recovery classifier", () => {
  it("requeues timed-out RUNNING under max attempts", () => {
    expect(
      classifyStuckRenderJob({
        job: {
          id: "j1",
          status: "RUNNING",
          attempt: 1,
          timeoutAtMs: 100,
          kind: "TAKE_EXPORT",
        },
        nowMs: 200,
      }),
    ).toEqual({ action: "REQUEUE", reason: "TIMEOUT" });
  });

  it("fails terminal when attempts exhausted", () => {
    expect(
      classifyStuckRenderJob({
        job: {
          id: "j1",
          status: "RUNNING",
          attempt: 3,
          timeoutAtMs: 100,
          kind: "MIX",
        },
        nowMs: 200,
        maxAttempts: 3,
      }),
    ).toEqual({ action: "FAIL_TERMINAL", reason: "TIMEOUT_EXHAUSTED" });
  });

  it("ignores SFM kinds at Premium worker recovery boundary", () => {
    expect(isSfmExecutorKind("SFM_QUALITY_ENCODE")).toBe(true);
    expect(isSfmExecutorKind("TAKE_EXPORT")).toBe(false);
  });
});
