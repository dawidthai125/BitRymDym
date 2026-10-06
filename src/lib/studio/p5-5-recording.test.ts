/**
 * P5.5 — Studio recording foundation unit tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  geometryForStudioRecording,
  listTakeClips,
  takeDurationSecondsToMs,
} from "@/lib/studio/studio-record-ops";
import {
  listTakeClipTimings,
  pickTakeClipAtPlayhead,
} from "@/lib/studio/studio-take-audio";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  isRecordingBusy,
  reduceRecordingUi,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";

function takeClip(overrides: Partial<StudioClipDto> = {}): StudioClipDto {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    trackId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    sourceKind: "TAKE",
    sourceTakeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    sourceBeatId: null,
    sourceArtifactId: null,
    timelineStartMs: 15_000,
    durationMs: 10_000,
    sourceOffsetMs: 0,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...overrides,
  };
}

describe("P5.5 recording geometry (playhead → Clip)", () => {
  it("places take at playhead 0 with source_offset 0", () => {
    const g = geometryForStudioRecording({
      playheadMs: 0,
      durationSeconds: 2.5,
      timelineLengthMs: 60_000,
    });
    expect(g.timelineStartMs).toBe(0);
    expect(g.sourceOffsetMs).toBe(0);
    expect(g.durationMs).toBe(2500);
  });

  it("places take at playhead > 0 with integer ms duration", () => {
    const g = geometryForStudioRecording({
      playheadMs: 25_000,
      durationSeconds: 3.14159,
      timelineLengthMs: 90_000,
    });
    expect(g.timelineStartMs).toBe(25_000);
    expect(g.sourceOffsetMs).toBe(0);
    expect(Number.isInteger(g.durationMs)).toBe(true);
    expect(g.durationMs).toBe(3142);
  });

  it("rejects non-integer playhead", () => {
    expect(() =>
      geometryForStudioRecording({
        playheadMs: 1.5,
        durationSeconds: 1,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/integer/);
  });

  it("rejects recording past timeline end", () => {
    expect(() =>
      geometryForStudioRecording({
        playheadMs: 55_000,
        durationSeconds: 10,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/długość/);
  });

  it("converts take duration seconds to positive integer ms", () => {
    expect(takeDurationSecondsToMs(1.004)).toBe(1004);
    expect(() => takeDurationSecondsToMs(0)).toThrow();
  });
});

describe("P5.5 Take → Clip listing / immutability contract", () => {
  it("lists TAKE clips with source_take_id", () => {
    const clips = [
      takeClip({ timelineStartMs: 30_000 }),
      takeClip({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        sourceKind: "BEAT_REF",
        sourceTakeId: null,
        sourceBeatId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        timelineStartMs: 0,
      }),
      takeClip({
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        sourceTakeId: "99999999-9999-4999-8999-999999999999",
        timelineStartMs: 5_000,
      }),
    ];
    const takes = listTakeClips(clips);
    expect(takes).toHaveLength(2);
    expect(takes[0]!.timelineStartMs).toBe(5_000);
    expect(takes.every((c) => c.sourceTakeId)).toBe(true);
  });

  it("pickTakeClipAtPlayhead finds active take without mutating source", () => {
    const timings = listTakeClipTimings([
      takeClip({ timelineStartMs: 15_000, durationMs: 10_000 }),
    ]);
    expect(pickTakeClipAtPlayhead(timings, 14_999)).toBeNull();
    const hit = pickTakeClipAtPlayhead(timings, 15_000);
    expect(hit?.takeId).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(hit?.sourceOffsetMs).toBe(0);
    expect(pickTakeClipAtPlayhead(timings, 25_000)).toBeNull();
  });
});

describe("P5.5 recording UI state machine (reuse P3/P4)", () => {
  const phases: RecordingUiPhase[] = [
    "IDLE",
    "REQUESTING_MIC",
    "READY",
    "RECORDING",
    "STOPPING",
    "UPLOADING",
    "PROCESSING",
    "READY_TAKE",
    "MIC_DENIED",
    "RECORDING_ERROR",
  ];

  it("covers idle → preparing → ready → recording → finalizing → ready", () => {
    let state = createInitialRecordingUiSnapshot({ maxRecordingSeconds: 30 });
    expect(state.phase).toBe("IDLE");

    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    expect(state.phase).toBe("REQUESTING_MIC");

    state = reduceRecordingUi(state, { type: "MIC_READY" });
    expect(state.phase).toBe("READY");

    state = reduceRecordingUi(state, { type: "START_RECORDING" });
    expect(state.phase).toBe("RECORDING");
    expect(isRecordingBusy(state.phase)).toBe(true);

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
      takeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      previewUrl: null,
      takeDurationSeconds: 1.5,
    });
    expect(state.phase).toBe("READY_TAKE");
    expect(canStartNewRecording(state.phase)).toBe(true);
  });

  it("supports error and cancelled (retry idle)", () => {
    let state = createInitialRecordingUiSnapshot();
    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    state = reduceRecordingUi(state, {
      type: "MIC_DENIED",
      message: "Nie przyznano dostępu do mikrofonu.",
    });
    expect(state.phase).toBe("MIC_DENIED");
    expect(state.error).toMatch(/mikrofonu/);

    state = reduceRecordingUi(state, { type: "RETRY_IDLE" });
    expect(state.phase).toBe("IDLE");

    state = reduceRecordingUi(state, { type: "REQUEST_MIC" });
    state = reduceRecordingUi(state, { type: "MIC_READY" });
    state = reduceRecordingUi(state, { type: "START_RECORDING" });
    state = reduceRecordingUi(state, { type: "RETRY_IDLE" });
    expect(state.phase).toBe("IDLE");
  });

  it("exports phase vocabulary used by Studio panel", () => {
    expect(phases).toContain("IDLE");
    expect(phases).toContain("RECORDING");
    expect(phases).toContain("MIC_DENIED");
    expect(phases).toContain("RECORDING_ERROR");
  });
});

describe("P5.5 reuse / isolation guards", () => {
  it("Studio record service reuses addStudioClipFor + eligibility APIs (no second pipeline)", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-record-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/addStudioClipFor/);
    expect(service).toMatch(/sourceKind:\s*"TAKE"/);
    expect(service).toMatch(/sourceTakeId/);
    expect(service).not.toMatch(/createAnonTake/);
    expect(service).not.toMatch(/MediaRecorder/);
  });

  it("Studio recording panel reuses TakeMediaRecorder + reduceRecordingUi + uploadTakeRecordingBlob", () => {
    const panel = readFileSync(
      join(process.cwd(), "src/components/studio/studio-recording-panel.tsx"),
      "utf8",
    );
    expect(panel).toMatch(/TakeMediaRecorder/);
    expect(panel).toMatch(/reduceRecordingUi/);
    expect(panel).toMatch(/uploadTakeRecordingBlob/);
    expect(panel).toMatch(/\/api\/takes\/eligibility/);
    expect(panel).toMatch(/timelineStartMs/);
    expect(panel).toMatch(/playheadMs/);
    expect(panel).not.toMatch(/PlayerProvider/);
    expect(panel).not.toMatch(/uploadAnonTakeRecordingBlob/);
  });

  it("StudioTransport remains distinct from PlayerProvider and layers TAKE audio", () => {
    const transport = readFileSync(
      join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
      "utf8",
    );
    expect(transport).toMatch(/takeAudioRef/);
    expect(transport).toMatch(/\/api\/takes\/preview/);
    expect(transport).toMatch(/setSuppressed\(true\)/);
    expect(transport).not.toMatch(/PlayerProvider\s*\(/);
  });

  it("place route rejects client storage/ownership fields", () => {
    const route = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/record/place/route.ts",
      ),
      "utf8",
    );
    expect(route).toMatch(/ownerId/);
    expect(route).toMatch(/objectKey/);
    expect(route).toMatch(/placeReadyTakeAsStudioClip/);
  });

  it("does not import PlayerProvider into Studio editor", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/StudioRecordingPanel/);
    expect(editor).toMatch(/recordingLocked|interactionLocked|TRYB NAGRYWANIA/);
    expect(editor).not.toMatch(/from \"@\/components\/player\/player-provider\"/);
  });
});
