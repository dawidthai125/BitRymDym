import { describe, expect, it } from "vitest";

import { geometryForStudioRecording } from "./studio-record-ops";

describe("sample copy clip length (whole-second take duration)", () => {
  it("keeps the old cap without slack", () => {
    const g = geometryForStudioRecording({ playheadMs: 0, durationSeconds: 3, timelineLengthMs: 60_000, durationMs: 3429 });
    expect(g.durationMs).toBe(3000);
  });

  it("reaches the exact sample length with slack, never more than 999 ms past the take", () => {
    expect(geometryForStudioRecording({ playheadMs: 0, durationSeconds: 3, timelineLengthMs: 60_000, durationMs: 3429, durationSlackMs: 999 }).durationMs).toBe(3429);
    expect(geometryForStudioRecording({ playheadMs: 0, durationSeconds: 3, timelineLengthMs: 60_000, durationMs: 9000, durationSlackMs: 5000 }).durationMs).toBe(3999);
  });
});
