/**
 * Phase 4 — Precision clip editing contracts (trim / move / split / sourceOffset).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STUDIO_CLIP_MIN_DURATION_MS } from "@/config/studio";
import {
  clipGeometryEqual,
  formatClipEditDeltaMs,
  planClipGeometryCommit,
  previewMoveClipStartMs,
  previewSplitAtPlayhead,
  previewTrimLeftToEdgeMs,
  previewTrimRightToEdgeMs,
} from "@/lib/studio/studio-clip-edit-preview";
import { splitClipGeometry } from "@/lib/studio/studio-clip-ops";
import {
  createDefaultSnapConfig,
  nudgeClipTimelineStartMs,
  resolveNudgeStepMs,
} from "@/lib/studio/studio-timeline-view";

const base = {
  timelineStartMs: 10_000,
  durationMs: 5000,
  sourceOffsetMs: 2000,
};

describe("Phase 4 trim left", () => {
  it("LEFT +500ms advances start/offset and shortens duration", () => {
    const next = previewTrimLeftToEdgeMs({
      clip: base,
      edgeTimelineMs: 10_500,
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
    });
    expect(next).toEqual({
      timelineStartMs: 10_500,
      durationMs: 4500,
      sourceOffsetMs: 2500,
    });
    expect(planClipGeometryCommit(base, next!).kind).toBe("trim_left");
    expect(planClipGeometryCommit(base, next!)).toEqual({
      kind: "trim_left",
      trimMs: 500,
    });
  });

  it("clamps to min duration; no-op when edge unchanged", () => {
    const nearEnd = previewTrimLeftToEdgeMs({
      clip: base,
      edgeTimelineMs: clipEnd(base),
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
    });
    expect(nearEnd?.durationMs).toBe(STUDIO_CLIP_MIN_DURATION_MS);
    expect(
      previewTrimLeftToEdgeMs({
        clip: base,
        edgeTimelineMs: base.timelineStartMs,
        timelineLengthMs: 60_000,
        sourceDurationMs: 30_000,
      }),
    ).toBeNull();
  });

  it("outward extend uses set_geometry when source allows", () => {
    const next = previewTrimLeftToEdgeMs({
      clip: base,
      edgeTimelineMs: 9500,
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
    });
    expect(next).toEqual({
      timelineStartMs: 9500,
      durationMs: 5500,
      sourceOffsetMs: 1500,
    });
    expect(planClipGeometryCommit(base, next!).kind).toBe("set_geometry");
  });

  it("without source duration, outward extend is blocked", () => {
    expect(
      previewTrimLeftToEdgeMs({
        clip: base,
        edgeTimelineMs: 9500,
        timelineLengthMs: 60_000,
        sourceDurationMs: null,
      }),
    ).toBeNull();
  });
});

describe("Phase 4 trim right", () => {
  it("right edge -1000ms shortens duration (trim_right)", () => {
    const next = previewTrimRightToEdgeMs({
      clip: base,
      edgeTimelineMs: 14_000,
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
    });
    expect(next).toEqual({
      timelineStartMs: 10_000,
      durationMs: 4000,
      sourceOffsetMs: 2000,
    });
    expect(planClipGeometryCommit(base, next!)).toEqual({
      kind: "trim_right",
      trimMs: 1000,
    });
  });

  it("right edge +1000ms extends when source allows", () => {
    const next = previewTrimRightToEdgeMs({
      clip: base,
      edgeTimelineMs: 16_000,
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
    });
    expect(next?.durationMs).toBe(6000);
    expect(next?.sourceOffsetMs).toBe(2000);
    expect(planClipGeometryCommit(base, next!).kind).toBe("set_geometry");
  });

  it("cannot extend past source", () => {
    // sourceOffset 2000 + duration max = sourceDuration 6000 → max end = 10000+4000
    expect(
      previewTrimRightToEdgeMs({
        clip: base,
        edgeTimelineMs: 20_000,
        timelineLengthMs: 60_000,
        sourceDurationMs: 6000,
      })?.durationMs,
    ).toBeLessThanOrEqual(4000);
  });
});

describe("Phase 4 move + micro-move", () => {
  it("MOVE +20ms keeps sourceOffset", () => {
    const next = previewMoveClipStartMs({
      clip: base,
      timelineStartMs: 10_020,
      timelineLengthMs: 60_000,
    });
    expect(next).toEqual({
      timelineStartMs: 10_020,
      durationMs: 5000,
      sourceOffsetMs: 2000,
    });
    expect(planClipGeometryCommit(base, next!)).toEqual({
      kind: "move",
      timelineStartMs: 10_020,
    });
  });

  it("micro-move ±1 / ±10 / ±20", () => {
    expect(resolveNudgeStepMs({ shiftKey: false, altKey: false })).toBe(1);
    expect(resolveNudgeStepMs({ shiftKey: true, altKey: false })).toBe(10);
    expect(resolveNudgeStepMs({ shiftKey: false, altKey: true })).toBe(20);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 100,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: -20,
      }),
    ).toBe(80);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 0,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: -1,
      }),
    ).toBe(0);
  });
});

describe("Phase 4 split + sourceOffset", () => {
  it("split at 12000 with offset 5000 → right offset 7000", () => {
    const clip = {
      timelineStartMs: 10_000,
      durationMs: 4000,
      sourceOffsetMs: 5000,
    };
    const preview = previewSplitAtPlayhead({
      clip,
      playheadMs: 12_000,
      timelineLengthMs: 60_000,
    });
    expect(preview).toEqual({
      left: {
        timelineStartMs: 10_000,
        durationMs: 2000,
        sourceOffsetMs: 5000,
      },
      right: {
        timelineStartMs: 12_000,
        durationMs: 2000,
        sourceOffsetMs: 7000,
      },
    });
    // Mirrors SSOT geometry op.
    expect(
      splitClipGeometry({
        clip,
        atTimelineMs: 12_000,
        timelineLengthMs: 60_000,
      }),
    ).toEqual(preview);
  });

  it("rejects split at start/end", () => {
    expect(
      previewSplitAtPlayhead({
        clip: base,
        playheadMs: base.timelineStartMs,
        timelineLengthMs: 60_000,
      }),
    ).toBeNull();
    expect(
      previewSplitAtPlayhead({
        clip: base,
        playheadMs: clipEnd(base),
        timelineLengthMs: 60_000,
      }),
    ).toBeNull();
  });
});

describe("Phase 4 snap", () => {
  it("snap 20 ms on trim left edge", () => {
    const snap = createDefaultSnapConfig({ mode: "grid", gridIntervalMs: 20 });
    const next = previewTrimLeftToEdgeMs({
      clip: base,
      edgeTimelineMs: 10_010,
      timelineLengthMs: 60_000,
      sourceDurationMs: 30_000,
      snap,
    });
    expect(next).not.toBeNull();
    expect(next!.timelineStartMs % 20).toBe(0);
  });

  it("snap OFF allows 1 ms", () => {
    const next = previewMoveClipStartMs({
      clip: base,
      timelineStartMs: 10_001,
      timelineLengthMs: 60_000,
    });
    expect(next?.timelineStartMs).toBe(10_001);
  });
});

describe("Phase 4 wiring + architecture", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const lane = readFileSync(
    join(process.cwd(), "src/components/studio/studio-clip-lane.tsx"),
    "utf8",
  );
  const route = readFileSync(
    join(
      process.cwd(),
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
    ),
    "utf8",
  );

  it("reuses existing PATCH ops — no new endpoints", () => {
    expect(editor).toMatch(/persistClipGeometryCommit/);
    expect(editor).toMatch(/op: \"trim_left\"|body\.op = \"trim_left\"/);
    expect(editor).toMatch(/trim_right/);
    expect(editor).toMatch(/set_geometry/);
    expect(editor).toMatch(/splitSelectedAtPlayhead/);
    expect(editor).toMatch(/atTimelineMs: getPlayheadMs\(\)/);
    expect(route).toMatch(/case \"trim_left\"/);
    expect(route).toMatch(/case \"set_geometry\"/);
    expect(editor).not.toMatch(/\/api\/studio\/.*\/trim/);
    expect(editor).not.toMatch(/\/nudge/);
  });

  it("clip lane has trim handles + DOM readout (no per-pixel React state)", () => {
    expect(lane).toMatch(/data-studio-trim-left/);
    expect(lane).toMatch(/data-studio-trim-right/);
    expect(lane).toMatch(/data-studio-clip-drag/);
    expect(lane).toMatch(/studio-clip-edit-readout/);
    expect(lane).toMatch(/planClipGeometryCommit/);
    expect(lane).not.toMatch(/useState\(/);
  });

  it("ONE engine / no second time model", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(lane).not.toMatch(/new AudioContext/);
    expect(lane).not.toMatch(/PlayerProvider/);
  });

  it("formatClipEditDeltaMs is compact", () => {
    expect(formatClipEditDeltaMs(20)).toBe("+20 ms");
    expect(formatClipEditDeltaMs(-20)).toMatch(/20 ms/);
    expect(clipGeometryEqual(base, base)).toBe(true);
  });
});

function clipEnd(clip: { timelineStartMs: number; durationMs: number }) {
  return clip.timelineStartMs + clip.durationMs;
}
