/**
 * Phase 2 — Precision timeline foundation (zoom / snap / nudge / playhead).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTimelineRulerTicks,
  clampPxPerMs,
  clipEdgeGeometryMs,
  cycleStudioSnapConfig,
  fitPxPerMs,
  msToPx,
  nudgeClipTimelineStartMs,
  pxToMs,
  resolveNudgeStepMs,
  snapConfigFromPreset,
  snapPresetFromConfig,
  snapTimelineMs,
  STUDIO_NUDGE_COARSE_MS,
  STUDIO_NUDGE_FINE_MS,
  STUDIO_NUDGE_MEDIUM_MS,
  STUDIO_SNAP_INTERVALS_MS,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  STUDIO_TIMELINE_MAX_PX_PER_MS,
  STUDIO_TIMELINE_MIN_PX_PER_MS,
  timelineMsAtViewportX,
  zoomAroundAnchorMs,
  zoomInPxPerMs,
  zoomOutPxPerMs,
} from "@/lib/studio/studio-timeline-view";

describe("Phase 2 zoom", () => {
  it("default zoom is the shared constant", () => {
    expect(STUDIO_TIMELINE_DEFAULT_PX_PER_MS).toBe(0.01);
    expect(clampPxPerMs(STUDIO_TIMELINE_DEFAULT_PX_PER_MS)).toBe(
      STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
    );
  });

  it("max zoom is >= 1.0 px/ms", () => {
    expect(STUDIO_TIMELINE_MAX_PX_PER_MS).toBeGreaterThanOrEqual(1);
    expect(clampPxPerMs(2)).toBe(STUDIO_TIMELINE_MAX_PX_PER_MS);
    expect(clampPxPerMs(1)).toBe(1);
  });

  it("zoom in reaches max and zoom out reaches min", () => {
    let z = STUDIO_TIMELINE_DEFAULT_PX_PER_MS;
    for (let i = 0; i < 40; i += 1) z = zoomInPxPerMs(z);
    expect(z).toBe(STUDIO_TIMELINE_MAX_PX_PER_MS);
    for (let i = 0; i < 40; i += 1) z = zoomOutPxPerMs(z);
    expect(z).toBe(STUDIO_TIMELINE_MIN_PX_PER_MS);
  });

  it("fit returns clamped density", () => {
    const fitted = fitPxPerMs(60_000, 800);
    expect(fitted).toBeGreaterThanOrEqual(STUDIO_TIMELINE_MIN_PX_PER_MS);
    expect(fitted).toBeLessThanOrEqual(STUDIO_TIMELINE_MAX_PX_PER_MS);
  });

  it("zoomAroundAnchorMs keeps anchor under the cursor", () => {
    const current = 0.01;
    // Far enough from 0 so scrollLeft stays ≥ 0 after zoom-in.
    const anchorMs = 30_000;
    const viewportOffsetPx = 200;
    const scrollBefore = msToPx(anchorMs, current) - viewportOffsetPx;
    expect(scrollBefore).toBeGreaterThan(0);
    expect(
      timelineMsAtViewportX({
        scrollLeft: scrollBefore,
        viewportOffsetPx,
        pxPerMs: current,
      }),
    ).toBe(anchorMs);

    const next = zoomInPxPerMs(current);
    const result = zoomAroundAnchorMs({
      currentPxPerMs: current,
      nextPxPerMs: next,
      anchorMs,
      viewportOffsetPx,
    });
    expect(result.pxPerMs).toBe(next);
    expect(result.anchorMs).toBe(anchorMs);
    expect(result.scrollLeft).toBeGreaterThan(0);
    expect(
      timelineMsAtViewportX({
        scrollLeft: result.scrollLeft,
        viewportOffsetPx,
        pxPerMs: result.pxPerMs,
      }),
    ).toBe(anchorMs);
  });

  it("zoom around cursor at max density still preserves 20 ms exactly", () => {
    const density = STUDIO_TIMELINE_MAX_PX_PER_MS;
    expect(msToPx(20, density)).toBe(20);
    expect(pxToMs(20, density)).toBe(20);
  });
});

describe("Phase 2 time SSOT", () => {
  it("pxToMs / msToPx round-trip integer ms including 20", () => {
    for (const density of [0.01, 0.1, 1]) {
      for (const ms of [0, 1, 20, 100, 1000, 12_340]) {
        expect(pxToMs(msToPx(ms, density), density)).toBe(ms);
      }
    }
  });

  it("pxToMs always returns integer", () => {
    expect(Number.isInteger(pxToMs(123.4, 0.05))).toBe(true);
    expect(Number.isInteger(pxToMs(0.4, 1))).toBe(true);
  });
});

describe("Phase 2 snap", () => {
  it("exposes OFF / 20 / 100 / 1000 presets", () => {
    expect([...STUDIO_SNAP_INTERVALS_MS]).toEqual([20, 100, 1000]);
    expect(snapPresetFromConfig(snapConfigFromPreset("off"))).toBe("off");
    expect(snapPresetFromConfig(snapConfigFromPreset("20"))).toBe("20");
    expect(snapPresetFromConfig(snapConfigFromPreset("100"))).toBe("100");
    expect(snapPresetFromConfig(snapConfigFromPreset("1000"))).toBe("1000");
  });

  it("OFF rounds to integer only", () => {
    const cfg = snapConfigFromPreset("off");
    expect(snapTimelineMs(1500.4, cfg)).toBe(1500);
    expect(snapTimelineMs(20.2, cfg)).toBe(20);
  });

  it("20 ms grid", () => {
    const cfg = snapConfigFromPreset("20");
    expect(snapTimelineMs(29, cfg)).toBe(20);
    expect(snapTimelineMs(30, cfg)).toBe(40);
    expect(snapTimelineMs(20, cfg)).toBe(20);
  });

  it("100 ms grid", () => {
    const cfg = snapConfigFromPreset("100");
    expect(snapTimelineMs(149, cfg)).toBe(100);
    expect(snapTimelineMs(150, cfg)).toBe(200);
  });

  it("1000 ms grid", () => {
    const cfg = snapConfigFromPreset("1000");
    expect(snapTimelineMs(1499, cfg)).toBe(1000);
    expect(snapTimelineMs(1500, cfg)).toBe(2000);
  });

  it("cycle walks OFF → 20 → 100 → 1000 → OFF", () => {
    let cfg = snapConfigFromPreset("off");
    cfg = cycleStudioSnapConfig(cfg);
    expect(snapPresetFromConfig(cfg)).toBe("20");
    cfg = cycleStudioSnapConfig(cfg);
    expect(snapPresetFromConfig(cfg)).toBe("100");
    cfg = cycleStudioSnapConfig(cfg);
    expect(snapPresetFromConfig(cfg)).toBe("1000");
    cfg = cycleStudioSnapConfig(cfg);
    expect(snapPresetFromConfig(cfg)).toBe("off");
  });
});

describe("Phase 2 nudge", () => {
  it("resolves 1 / 10 / 20 ms steps from modifiers", () => {
    expect(resolveNudgeStepMs({ shiftKey: false, altKey: false })).toBe(
      STUDIO_NUDGE_FINE_MS,
    );
    expect(resolveNudgeStepMs({ shiftKey: true, altKey: false })).toBe(
      STUDIO_NUDGE_MEDIUM_MS,
    );
    expect(resolveNudgeStepMs({ shiftKey: false, altKey: true })).toBe(
      STUDIO_NUDGE_COARSE_MS,
    );
    expect(resolveNudgeStepMs({ shiftKey: true, altKey: true })).toBe(
      STUDIO_NUDGE_COARSE_MS,
    );
  });

  it("applies ±1 ±10 ±20 and clamps to timeline", () => {
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 20,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: -20,
      }),
    ).toBe(0);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 0,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: 1,
      }),
    ).toBe(1);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 0,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: 10,
      }),
    ).toBe(10);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 50,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: -20,
      }),
    ).toBe(30);
    expect(
      nudgeClipTimelineStartMs({
        timelineStartMs: 9500,
        durationMs: 1000,
        timelineLengthMs: 10_000,
        deltaMs: 20,
      }),
    ).toBe(9000);
  });
});

describe("Phase 2 trim / waveform prep helpers", () => {
  it("clipEdgeGeometryMs exposes left/right for Phase 3 handles", () => {
    expect(
      clipEdgeGeometryMs({
        timelineStartMs: 100,
        durationMs: 500,
        sourceOffsetMs: 40,
      }),
    ).toEqual({
      leftMs: 100,
      rightMs: 600,
      sourceOffsetMs: 40,
      durationMs: 500,
    });
  });

  it("high-zoom ruler can emit sub-100 ms ticks", () => {
    const ticks = buildTimelineRulerTicks({
      timelineLengthMs: 200,
      pxPerMs: 1,
      targetTickPx: 20,
    });
    expect(ticks.some((t) => t.ms > 0 && t.ms < 100)).toBe(true);
  });
});

describe("Phase 2 editor wiring + architecture", () => {
  const editor = readFileSync(
    join(process.cwd(), "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const view = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-timeline-view.ts"),
    "utf8",
  );

  it("nudge persists via existing move PATCH/CAS (no /nudge API)", () => {
    expect(editor).toMatch(/persistClipMove/);
    expect(editor).toMatch(/op: \"move\"/);
    expect(editor).toMatch(/applySnapGrid: false/);
    expect(editor).toMatch(/resolveNudgeStepMs/);
    expect(editor).not.toMatch(/\/nudge/);
    expect(editor).not.toMatch(/\/zoom/);
    expect(editor).not.toMatch(/\/snap/);
  });

  it("split still uses exact playheadMs", () => {
    expect(editor).toMatch(/atTimelineMs: getPlayheadMs\(\)/);
    expect(editor).toMatch(/splitSelectedAtPlayhead/);
  });

  it("Ctrl\/Cmd wheel zoom + cursor-centered zoom helpers are wired", () => {
    expect(editor).toMatch(/zoomAroundAnchorMs/);
    expect(editor).toMatch(/ctrlKey \|\| event\.metaKey/);
    expect(editor).toMatch(/onZoomAroundViewport/);
    expect(view).toMatch(/STUDIO_TIMELINE_MAX_PX_PER_MS = 1/);
  });

  it("does not invent second engine \/ AudioContext \/ PlayerProvider", () => {
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(editor).not.toMatch(/PlayerProvider/);
  });

  it("clip shell hosts StudioClipWaveform without brand Waveform", () => {
    expect(editor).toMatch(/StudioClipLaneItem/);
    const lane = readFileSync(
      join(process.cwd(), "src/components/studio/studio-clip-lane.tsx"),
      "utf8",
    );
    expect(lane).toMatch(/data-studio-clip=/);
    expect(lane).toMatch(/StudioClipWaveform/);
    expect(editor).not.toMatch(/function StudioClipWaveform/);
    expect(editor).not.toMatch(/from \"@\/components\/brand\/waveform\"/);
    expect(editor).not.toMatch(/from '@\/components\/brand\/waveform'/);
  });

  it("snap UI exposes cycling presets", () => {
    expect(editor).toMatch(/cycleStudioSnapConfig/);
    expect(editor).toMatch(/Snap \{studioSnapPresetLabel/);
  });
});
