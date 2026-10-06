/**
 * P5.6 — Studio Take Workflow unit / contract tests.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  findIdenticalTakeClipPlacement,
  geometryForStudioRecording,
  listTakeClips,
} from "@/lib/studio/studio-record-ops";
import type { StudioClipDto } from "@/lib/studio/studio-types";
import {
  canStartNewRecording,
  createInitialRecordingUiSnapshot,
  reduceRecordingUi,
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

const panelPath = join(
  process.cwd(),
  "src/components/studio/studio-recording-panel.tsx",
);
const transportPath = join(
  process.cwd(),
  "src/components/studio/studio-transport-provider.tsx",
);
const servicePath = join(
  process.cwd(),
  "src/lib/studio/studio-record-service.ts",
);
const placeRoutePath = join(
  process.cwd(),
  "src/app/api/studio/projects/[projectId]/record/place/route.ts",
);
const takesRoutePath = join(
  process.cwd(),
  "src/app/api/studio/projects/[projectId]/record/takes/route.ts",
);

describe("P5.6 auto-place decoupling", () => {
  it("panel finalizes Take READY without calling place in stopAndFinalize", () => {
    const panel = readFileSync(panelPath, "utf8");
    // stopAndFinalize must reach TAKE_READY without place fetch in that function body order.
    const stopIdx = panel.indexOf("async function stopAndFinalize");
    const keepIdx = panel.indexOf("async function onKeepWorkflowTake");
    expect(stopIdx).toBeGreaterThan(-1);
    expect(keepIdx).toBeGreaterThan(stopIdx);
    const stopBody = panel.slice(stopIdx, keepIdx);
    expect(stopBody).toMatch(/TAKE_READY/);
    expect(stopBody).toMatch(/uploadTakeRecordingBlob/);
    expect(stopBody).not.toMatch(/record\/place/);
    expect(panel).toMatch(/onKeepWorkflowTake/);
    expect(panel).toMatch(/record\/place/);
  });

  it("Keep places via existing place endpoint; Discard uses /api/takes/delete", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toMatch(/Zachowaj/);
    expect(panel).toMatch(/Odrzuć/);
    expect(panel).toMatch(/Nagraj ponownie/);
    expect(panel).toMatch(/Odtwórz/);
    expect(panel).toMatch(/\/api\/takes\/delete/);
    expect(panel).toMatch(/Odrzucić nagranie\?/);
    expect(panel).toMatch(/Nagranie zostanie usunięte\./);
  });
});

describe("P5.6 Keep idempotency", () => {
  it("finds identical track+take+start placement", () => {
    const clips = [
      takeClip({ id: "clip-1", timelineStartMs: 10_000 }),
      takeClip({
        id: "clip-2",
        sourceTakeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        timelineStartMs: 10_000,
      }),
    ];
    const hit = findIdenticalTakeClipPlacement(clips, {
      trackId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      takeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      timelineStartMs: 10_000,
    });
    expect(hit?.id).toBe("clip-1");
  });

  it("allows same Take at a different timeline start (additive / retake geometry)", () => {
    const clips = [takeClip({ timelineStartMs: 10_000 })];
    const hit = findIdenticalTakeClipPlacement(clips, {
      trackId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      takeId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      timelineStartMs: 20_000,
    });
    expect(hit).toBeUndefined();
  });

  it("service reuses findIdenticalTakeClipPlacement + returns reusedExisting", () => {
    const service = readFileSync(servicePath, "utf8");
    expect(service).toMatch(/findIdenticalTakeClipPlacement/);
    expect(service).toMatch(/reusedExisting/);
    expect(service).toMatch(/listReadyTakesForStudioPlaceFor/);
  });
});

describe("P5.6 multiple Takes / overlap", () => {
  it("lists multiple TAKE clips including overlap at same start", () => {
    const clips = [
      takeClip({
        id: "a",
        sourceTakeId: "t1",
        timelineStartMs: 0,
        durationMs: 10_000,
      }),
      takeClip({
        id: "b",
        sourceTakeId: "t2",
        timelineStartMs: 0,
        durationMs: 10_000,
      }),
    ];
    const listed = listTakeClips(clips);
    expect(listed).toHaveLength(2);
    expect(listed.map((c) => c.sourceTakeId)).toEqual(["t1", "t2"]);
  });

  it("retake geometry does not require unique track placement", () => {
    const g1 = geometryForStudioRecording({
      playheadMs: 0,
      durationSeconds: 2,
      timelineLengthMs: 60_000,
    });
    const g2 = geometryForStudioRecording({
      playheadMs: 0,
      durationSeconds: 3,
      timelineLengthMs: 60_000,
    });
    expect(g1.timelineStartMs).toBe(g2.timelineStartMs);
    expect(g1.durationMs).not.toBe(g2.durationMs);
  });
});

describe("P5.6 UI workflow states (not DB)", () => {
  it("READY_TAKE retains takeId; RETRY_IDLE clears for new capture", () => {
    let state = createInitialRecordingUiSnapshot();
    state = reduceRecordingUi(state, {
      type: "TAKE_READY",
      takeId: "take-1",
      previewUrl: null,
      takeDurationSeconds: 1.5,
    });
    expect(state.phase).toBe("READY_TAKE");
    expect(state.takeId).toBe("take-1");
    expect(canStartNewRecording("READY_TAKE")).toBe(true);
    state = reduceRecordingUi(state, { type: "RETRY_IDLE" });
    expect(state.phase).toBe("IDLE");
    expect(state.takeId).toBeNull();
  });

  it("does not introduce PREVIEWING/KEPT/PLACING DB phases", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).not.toMatch(/active_take_id/);
    expect(panel).not.toMatch(/PREVIEWING/);
    expect(panel).not.toMatch(/StudioRecorderV2/);
  });
});

describe("P5.6 preview / transport isolation", () => {
  it("transport exposes previewTake via /api/takes/preview without PlayerProvider coupling", () => {
    const transport = readFileSync(transportPath, "utf8");
    expect(transport).toMatch(/previewTake/);
    expect(transport).toMatch(/stopTakePreview/);
    expect(transport).toMatch(/\/api\/takes\/preview/);
    expect(transport).toMatch(/takePreviewActive/);
    expect(transport).not.toMatch(/PlayerProvider\s*\(/);
  });

  it("panel uses transport.previewTake and never PlayerProvider", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toMatch(/previewTake/);
    expect(panel).toMatch(/stopTakePreview/);
    expect(panel).not.toMatch(/PlayerProvider/);
    expect(panel).toMatch(/Moje Take'i/);
    expect(panel).toMatch(/Umieść w Studio/);
  });
});

describe("P5.6 place / security / library routes", () => {
  it("place route still rejects client ownership/storage fields", () => {
    const route = readFileSync(placeRoutePath, "utf8");
    expect(route).toMatch(/ownerId/);
    expect(route).toMatch(/objectKey/);
    expect(route).toMatch(/placeReadyTakeAsStudioClip/);
    expect(route).toMatch(/reusedExisting/);
  });

  it("takes list route reuses listReadyTakesForStudioPlace", () => {
    const route = readFileSync(takesRoutePath, "utf8");
    expect(route).toMatch(/listReadyTakesForStudioPlace/);
    expect(route).toMatch(/export async function GET/);
  });

  it("error copy covers preview / place / discard / unavailable", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toMatch(/Nie udało się odtworzyć nagrania\./);
    expect(panel).toMatch(/Nie udało się umieścić nagrania na osi czasu\./);
    expect(panel).toMatch(/Nie udało się usunąć nagrania\./);
    expect(panel).toMatch(/Nagranie nie jest już dostępne\./);
  });
});

describe("P5.6 mobile / recording lock contract", () => {
  it("workflow controls are full-width touch friendly", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toMatch(/w-full/);
    expect(panel).toMatch(/grid-cols-1/);
    expect(panel).toMatch(/onRecordingActiveChange/);
    // Recording lock still only during capture/finalize — not READY_TAKE decision.
    expect(panel).toMatch(/READY_TAKE is decision UI/);
  });
});

describe("P5.6 reuse / regression guards", () => {
  it("still reuses TakeMediaRecorder + reduceRecordingUi + uploadTakeRecordingBlob", () => {
    const panel = readFileSync(panelPath, "utf8");
    expect(panel).toMatch(/useStudioInputDevices/);
    expect(panel).toMatch(/TakeMediaRecorder/);
    expect(panel).toMatch(/reduceRecordingUi/);
    expect(panel).toMatch(/uploadTakeRecordingBlob/);
    expect(panel).toMatch(/\/api\/takes\/eligibility/);
  });

  it("place service still uses addStudioClipFor TAKE immutable source", () => {
    const service = readFileSync(servicePath, "utf8");
    expect(service).toMatch(/addStudioClipFor/);
    expect(service).toMatch(/sourceKind:\s*"TAKE"/);
    expect(service).toMatch(/sourceTakeId/);
    expect(service).not.toMatch(/createAnonTake/);
    expect(service).not.toMatch(/MediaRecorder/);
  });
});
