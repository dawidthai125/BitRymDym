import { describe, expect, it } from "vitest";

import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  displayMaxRecordingSeconds,
  isRecordingBusy,
  reduceRecordingUi,
} from "@/lib/takes/recording-ui-state";

describe("Recording Wave 3 — recording UI state machine", () => {
  it("walks happy path IDLE → READY_TAKE", () => {
    let state = createInitialRecordingUiSnapshot({ maxRecordingSeconds: 30 });
    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    expect(state.phase).toBe("REQUESTING_MIC");
    state = reduceRecordingUi(state, { type: "MIC_READY" });
    expect(state.phase).toBe("READY");
    state = reduceRecordingUi(state, { type: "START_RECORDING" });
    expect(state.phase).toBe("RECORDING");
    state = reduceRecordingUi(state, { type: "TICK", elapsedMs: 1500 });
    expect(state.elapsedMs).toBe(1500);
    state = reduceRecordingUi(state, { type: "STOP" });
    expect(state.phase).toBe("STOPPING");
    state = reduceRecordingUi(state, { type: "UPLOAD_START" });
    expect(state.phase).toBe("UPLOADING");
    state = reduceRecordingUi(state, { type: "FINALIZE_START" });
    expect(state.phase).toBe("PROCESSING");
    state = reduceRecordingUi(state, {
      type: "TAKE_READY",
      takeId: "t1",
      previewUrl: "https://example.test/p",
      takeDurationSeconds: 2,
    });
    expect(state.phase).toBe("READY_TAKE");
    expect(state.takeId).toBe("t1");
  });

  it("allows vocal import upload path IDLE → UPLOADING → READY_TAKE", () => {
    let state = createInitialRecordingUiSnapshot({ maxRecordingSeconds: 174 });
    state = reduceRecordingUi(state, { type: "UPLOAD_START" });
    expect(state.phase).toBe("UPLOADING");
    state = reduceRecordingUi(state, { type: "FINALIZE_START" });
    expect(state.phase).toBe("PROCESSING");
    state = reduceRecordingUi(state, {
      type: "TAKE_READY",
      takeId: "import-1",
      previewUrl: null,
      takeDurationSeconds: 12,
    });
    expect(state.phase).toBe("READY_TAKE");
    expect(state.takeId).toBe("import-1");
  });

  it("maps auth and eligibility errors", () => {
    let state = createInitialRecordingUiSnapshot();
    state = reduceRecordingUi(state, { type: "REQUIRE_AUTH" });
    expect(state.phase).toBe("AUTH_REQUIRED");
    state = reduceRecordingUi(state, { type: "BEAT_INELIGIBLE" });
    expect(state.phase).toBe("BEAT_NOT_ELIGIBLE");
  });

  it("maps mic / unsupported / transport failures", () => {
    let state = createInitialRecordingUiSnapshot();
    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    state = reduceRecordingUi(state, { type: "MIC_DENIED" });
    expect(state.phase).toBe("MIC_DENIED");

    state = reduceRecordingUi(state, { type: "UNSUPPORTED" });
    expect(state.phase).toBe("UNSUPPORTED");

    state = reduceRecordingUi(state, { type: "UPLOAD_FAILED" });
    expect(state.phase).toBe("UPLOAD_ERROR");

    state = reduceRecordingUi(state, { type: "FINALIZE_FAILED" });
    expect(state.phase).toBe("FINALIZE_ERROR");

    state = reduceRecordingUi(state, { type: "EXPIRED" });
    expect(state.phase).toBe("EXPIRED");
  });

  it("blocks duplicate start while busy and allows retry from READY_TAKE", () => {
    expect(isRecordingBusy("RECORDING")).toBe(true);
    expect(isRecordingBusy("UPLOADING")).toBe(true);
    expect(isRecordingBusy("IDLE")).toBe(false);
    expect(canStartNewRecording("READY_TAKE")).toBe(true);
    expect(canStartNewRecording("RECORDING")).toBe(false);
  });

  it("display max is MIN(beat, 180)", () => {
    expect(displayMaxRecordingSeconds(30)).toBe(30);
    expect(displayMaxRecordingSeconds(240)).toBe(180);
  });

  it("cancel/reset returns to IDLE without take id", () => {
    let state = createInitialRecordingUiSnapshot();
    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    state = reduceRecordingUi(state, { type: "MIC_READY" });
    state = reduceRecordingUi(state, { type: "START_RECORDING" });
    state = reduceRecordingUi(state, { type: "RETRY_IDLE" });
    expect(state.phase).toBe("IDLE");
    expect(state.takeId).toBeNull();
    expect(state.previewUrl).toBeNull();
  });
});
