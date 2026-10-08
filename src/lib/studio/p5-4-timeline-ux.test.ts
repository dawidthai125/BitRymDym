import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildTimelineRulerTicks,
  clearClipSelection,
  clampPxPerMs,
  contentWidthPx,
  createDefaultSnapConfig,
  fitPxPerMs,
  msToPx,
  pxToMs,
  resolveSelectedClipId,
  selectClipId,
  snapTimelineMs,
  STUDIO_TIMELINE_DEFAULT_PX_PER_MS,
  STUDIO_TIMELINE_MAX_PX_PER_MS,
  STUDIO_TIMELINE_MIN_PX_PER_MS,
  zoomInPxPerMs,
  zoomOutPxPerMs,
} from "@/lib/studio/studio-timeline-view";

describe("P5.4 timeline mapping", () => {
  it("maps ms → pixels → ms round-trip for integer ms", () => {
    const density = 0.02;
    for (const ms of [0, 1, 1000, 15_000, 60_000]) {
      const px = msToPx(ms, density);
      expect(pxToMs(px, density)).toBe(ms);
    }
  });

  it("zoom in/out stays within clamp and does not alter identity of ms values", () => {
    let z = STUDIO_TIMELINE_DEFAULT_PX_PER_MS;
    z = zoomInPxPerMs(z);
    z = zoomInPxPerMs(z);
    expect(z).toBeGreaterThan(STUDIO_TIMELINE_DEFAULT_PX_PER_MS);
    expect(z).toBeLessThanOrEqual(STUDIO_TIMELINE_MAX_PX_PER_MS);
    z = zoomOutPxPerMs(z);
    z = zoomOutPxPerMs(z);
    z = zoomOutPxPerMs(z);
    expect(z).toBeGreaterThanOrEqual(STUDIO_TIMELINE_MIN_PX_PER_MS);
    expect(msToPx(10_000, z) / clampPxPerMs(z)).toBe(10_000);
  });

  it("fit zoom scales project into viewport", () => {
    const fitted = fitPxPerMs(60_000, 360);
    expect(fitted).toBeGreaterThanOrEqual(STUDIO_TIMELINE_MIN_PX_PER_MS);
    expect(contentWidthPx(60_000, fitted)).toBeGreaterThanOrEqual(320);
  });
});

describe("P5.4 snap", () => {
  it("OFF rounds to integer ms only", () => {
    const cfg = createDefaultSnapConfig({ mode: "off" });
    expect(snapTimelineMs(1500.4, cfg)).toBe(1500);
    expect(snapTimelineMs(1500.6, cfg)).toBe(1501);
  });

  it("ON snaps to grid interval", () => {
    const cfg = createDefaultSnapConfig({
      mode: "grid",
      gridIntervalMs: 1000,
    });
    expect(snapTimelineMs(1499, cfg)).toBe(1000);
    expect(snapTimelineMs(1500, cfg)).toBe(2000);
    expect(snapTimelineMs(0, cfg)).toBe(0);
  });

  it("respects bounds and stays integer", () => {
    const cfg = createDefaultSnapConfig({
      mode: "grid",
      gridIntervalMs: 1000,
    });
    expect(
      snapTimelineMs(9500, cfg, { minMs: 0, maxMs: 8000 }),
    ).toBe(8000);
    expect(Number.isInteger(snapTimelineMs(1234.7, cfg))).toBe(true);
  });

  it("config reserves BPM fields without requiring them", () => {
    const cfg = createDefaultSnapConfig({
      mode: "grid",
      bpm: 92,
      beatsPerBar: 4,
      subdivision: 4,
    });
    expect(cfg.bpm).toBe(92);
    // P5.4 still uses gridIntervalMs, not BPM math.
    expect(snapTimelineMs(2400, cfg)).toBe(2000);
  });
});

describe("P5.4 selection", () => {
  it("selects, changes, and clears selection", () => {
    let selected: string | null = null;
    selected = selectClipId(selected, "clip-a");
    expect(selected).toBe("clip-a");
    selected = selectClipId(selected, "clip-b");
    expect(selected).toBe("clip-b");
    selected = clearClipSelection();
    expect(selected).toBeNull();
  });

  it("clears stale selection when clip disappears", () => {
    expect(resolveSelectedClipId("gone", ["a", "b"])).toBeNull();
    expect(resolveSelectedClipId("a", ["a", "b"])).toBe("a");
  });
});

describe("P5.4 ruler", () => {
  it("emits ticks covering the project", () => {
    const ticks = buildTimelineRulerTicks({
      timelineLengthMs: 60_000,
      pxPerMs: 0.01,
    });
    expect(ticks[0]?.ms).toBe(0);
    expect(ticks[ticks.length - 1]?.ms).toBe(60_000);
    expect(ticks.some((t) => t.major)).toBe(true);
  });
});

describe("P5.4 delete / security surface", () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-service.ts"),
    "utf8",
  );
  const route = readFileSync(
    join(
      process.cwd(),
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
    ),
    "utf8",
  );

  it("delete goes through ownership and only removes studio_clips", () => {
    expect(service).toMatch(/deleteStudioClipFor/);
    expect(service).toMatch(/loadOwnedClip/);
    // V1 PR-04: CAS RPC deletes clip row (Take untouched).
    expect(service).toMatch(/studio_cas_apply_clip_delete/);
    expect(service).not.toMatch(/\.from\("takes"\)\s*\n\s*\.delete/);
  });

  it("API exposes DELETE", () => {
    expect(route).toMatch(/export async function DELETE/);
    expect(route).toMatch(/deleteStudioClip/);
  });
});

describe("P5.4 regression guards", () => {
  it("reuses P5.3 geometry ops (no second move/trim/split)", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/op: "move"/);
    expect(editor).toMatch(/trim_left_to_playhead/);
    expect(editor).toMatch(/atTimelineMs/);
    expect(editor).toMatch(/method: "DELETE"/);
    // Phase 1–2 DAW toolbar — Snap cycle + zoom affordances (ops unchanged).
    expect(editor).toMatch(/Snap \{studioSnapPresetLabel/);
    expect(editor).toMatch(/title="Powiększ oś czasu"/);
  });

  it("StudioTransport remains distinct from PlayerProvider", () => {
    const transport = readFileSync(
      join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
      "utf8",
    );
    expect(transport).toMatch(/Distinct from PlayerProvider/);
  });
});
