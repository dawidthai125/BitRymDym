/**
 * P5.3 — Clip MOVE / TRIM / SPLIT pure logic + security surface.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STUDIO_CLIP_MIN_DURATION_MS } from "@/config/studio";
import {
  moveClipGeometry,
  splitClipGeometry,
  trimClipLeft,
  trimClipLeftToPlayhead,
  trimClipRight,
  trimClipRightToPlayhead,
} from "@/lib/studio/studio-clip-ops";

const base = {
  timelineStartMs: 10_000,
  durationMs: 30_000,
  sourceOffsetMs: 2_000,
};

describe("P5.3 MOVE", () => {
  it("changes start_ms only; duration + source offset unchanged", () => {
    const next = moveClipGeometry({
      clip: base,
      timelineStartMs: 15_000,
      timelineLengthMs: 60_000,
    });
    expect(next.timelineStartMs).toBe(15_000);
    expect(next.durationMs).toBe(30_000);
    expect(next.sourceOffsetMs).toBe(2_000);
  });

  it("rejects move past timeline end", () => {
    expect(() =>
      moveClipGeometry({
        clip: base,
        timelineStartMs: 40_000,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/exceeds/);
  });
});

describe("P5.3 TRIM", () => {
  it("trim left advances start + source offset and shortens duration", () => {
    const next = trimClipLeft({
      clip: base,
      trimMs: 5_000,
      timelineLengthMs: 60_000,
    });
    expect(next.timelineStartMs).toBe(15_000);
    expect(next.durationMs).toBe(25_000);
    expect(next.sourceOffsetMs).toBe(7_000);
  });

  it("trim right shortens duration only", () => {
    const next = trimClipRight({
      clip: base,
      trimMs: 5_000,
      timelineLengthMs: 60_000,
    });
    expect(next.timelineStartMs).toBe(10_000);
    expect(next.durationMs).toBe(25_000);
    expect(next.sourceOffsetMs).toBe(2_000);
  });

  it("trim left/right to playhead", () => {
    const left = trimClipLeftToPlayhead({
      clip: base,
      playheadMs: 20_000,
      timelineLengthMs: 60_000,
    });
    expect(left.timelineStartMs).toBe(20_000);
    expect(left.durationMs).toBe(20_000);
    expect(left.sourceOffsetMs).toBe(12_000);

    const right = trimClipRightToPlayhead({
      clip: base,
      playheadMs: 25_000,
      timelineLengthMs: 60_000,
    });
    expect(right.timelineStartMs).toBe(10_000);
    expect(right.durationMs).toBe(15_000);
    expect(right.sourceOffsetMs).toBe(2_000);
  });

  it("rejects trim that would leave zero-length clip", () => {
    expect(() =>
      trimClipLeft({
        clip: base,
        trimMs: 30_000,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/krótki/);
  });
});

describe("P5.3 SPLIT", () => {
  it("produces two clips with correct geometry and no overlap", () => {
    const { left, right } = splitClipGeometry({
      clip: base,
      atTimelineMs: 25_000,
      timelineLengthMs: 60_000,
    });
    expect(left).toEqual({
      timelineStartMs: 10_000,
      durationMs: 15_000,
      sourceOffsetMs: 2_000,
    });
    expect(right).toEqual({
      timelineStartMs: 25_000,
      durationMs: 15_000,
      sourceOffsetMs: 17_000,
    });
    expect(left.timelineStartMs + left.durationMs).toBe(right.timelineStartMs);
  });

  it("rejects split at start/end/outside", () => {
    expect(() =>
      splitClipGeometry({
        clip: base,
        atTimelineMs: 10_000,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/wewnątrz/);
    expect(() =>
      splitClipGeometry({
        clip: base,
        atTimelineMs: 40_000,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/wewnątrz/);
    expect(() =>
      splitClipGeometry({
        clip: base,
        atTimelineMs: 5_000,
        timelineLengthMs: 60_000,
      }),
    ).toThrow(/wewnątrz/);
  });

  it("rejects split creating sub-minimum duration", () => {
    expect(STUDIO_CLIP_MIN_DURATION_MS).toBe(1);
    expect(() =>
      splitClipGeometry({
        clip: { timelineStartMs: 0, durationMs: 1, sourceOffsetMs: 0 },
        atTimelineMs: 0,
        timelineLengthMs: 60_000,
      }),
    ).toThrow();
  });

  it("split after trim remains valid", () => {
    const trimmed = trimClipLeft({
      clip: base,
      trimMs: 5_000,
      timelineLengthMs: 60_000,
    });
    const { left, right } = splitClipGeometry({
      clip: trimmed,
      atTimelineMs: 25_000,
      timelineLengthMs: 60_000,
    });
    expect(left.durationMs + right.durationMs).toBe(trimmed.durationMs);
    expect(left.sourceOffsetMs).toBe(trimmed.sourceOffsetMs);
  });
});

describe("P5.3 security / persistence surface", () => {
  const service = readFileSync(
    join(process.cwd(), "src/lib/studio/studio-service.ts"),
    "utf8",
  );
  const patchRoute = readFileSync(
    join(
      process.cwd(),
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
    ),
    "utf8",
  );
  const splitRoute = readFileSync(
    join(
      process.cwd(),
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/split/route.ts",
    ),
    "utf8",
  );

  it("mutations go through ownership + service_role path", () => {
    expect(service).toMatch(/assertOwnsProject/);
    expect(service).toMatch(/loadOwnedClip/);
    expect(service).toMatch(/updateStudioClipGeometryFor/);
    expect(service).toMatch(/splitStudioClipFor/);
    // Geometry updates target studio_clips only (source Take rows are read, not updated).
    expect(service).toMatch(/\.from\("studio_clips"\)\s*\n\s*\.update/);
    expect(service).not.toMatch(/\.from\("takes"\)\s*\n\s*\.update/);
  });

  it("API exposes PATCH geometry + POST split", () => {
    expect(patchRoute).toMatch(/export async function PATCH/);
    expect(patchRoute).toMatch(/trim_left_to_playhead/);
    expect(splitRoute).toMatch(/export async function POST/);
    expect(splitRoute).toMatch(/atTimelineMs/);
  });

  it("source Take / beat ids are not rewritten on split insert", () => {
    expect(service).toMatch(/source_take_id: clip\.source_take_id/);
    expect(service).toMatch(/source_beat_id: clip\.source_beat_id/);
    expect(service).toMatch(/source_artifact_id: clip\.source_artifact_id/);
  });
});

describe("P5.3 regression guards", () => {
  it("P5.2 transport stays distinct from PlayerProvider", () => {
    const transport = readFileSync(
      join(process.cwd(), "src/components/studio/studio-transport-provider.tsx"),
      "utf8",
    );
    expect(transport).toMatch(/Distinct from PlayerProvider/);
    expect(transport).not.toMatch(/reducePlayback/);
  });

  it("min duration matches DB floor", () => {
    expect(STUDIO_CLIP_MIN_DURATION_MS).toBe(1);
  });
});
