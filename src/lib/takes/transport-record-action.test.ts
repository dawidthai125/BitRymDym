import { describe, expect, it } from "vitest";

import { transportRecordAction } from "@/lib/takes/recording-ui-state";

// Prod bug 2026-10-30: top-bar REC only opened the panel — it must start/stop capture.
describe("transportRecordAction (top-bar REC)", () => {
  it("prepares the mic and auto-starts from idle / recoverable errors", () => {
    for (const phase of ["IDLE", "MIC_DENIED", "RECORDING_ERROR", "UPLOAD_ERROR", "FINALIZE_ERROR", "EXPIRED", "UNSUPPORTED"] as const) {
      expect(transportRecordAction(phase, true)).toBe("prepare-then-start");
    }
  });
  it("starts when the mic is ready and stops while recording", () => {
    expect(transportRecordAction("READY", true)).toBe("start");
    expect(transportRecordAction("RECORDING", true)).toBe("stop");
    expect(transportRecordAction("RECORDING", false)).toBe("stop");
  });
  it("does nothing mid-flight, on the keep/discard decision, or without a track", () => {
    for (const phase of ["REQUESTING_MIC", "STOPPING", "UPLOADING", "PROCESSING", "READY_TAKE"] as const) {
      expect(transportRecordAction(phase, true)).toBe("none");
    }
    expect(transportRecordAction("IDLE", false)).toBe("none");
    expect(transportRecordAction("READY", false)).toBe("none");
  });
});
