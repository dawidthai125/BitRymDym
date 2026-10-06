/**
 * P5.1 — Studio foundation unit tests (time, transport, tracks, clips, freeze).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_MAX_PROJECTS_PER_USER,
  STUDIO_TRACK_TYPES,
} from "@/config/studio";
import { assertValidClipSource, assertClipPlacement } from "@/lib/studio/studio-clip-ops";
import {
  applySortOrders,
  isTrackAudible,
  reorderTrackIds,
} from "@/lib/studio/studio-track-ops";
import {
  clampPlayheadMs,
  formatStudioTimeMs,
  clipEndMs,
} from "@/lib/studio/studio-time";
import {
  createStudioTransportState,
  reduceStudioTransport,
} from "@/lib/studio/studio-transport";

describe("P5.1 time SSOT (integer ms)", () => {
  it("formats Polish mm:ss.mmm", () => {
    expect(formatStudioTimeMs(0)).toBe("00:00.000");
    expect(formatStudioTimeMs(84500)).toBe("01:24.500");
    expect(formatStudioTimeMs(98_200)).toBe("01:38.200");
  });

  it("rejects non-integer ms", () => {
    expect(() => formatStudioTimeMs(1.5)).toThrow(/integer/);
  });

  it("clamps playhead", () => {
    expect(clampPlayheadMs(-10, 1000)).toBe(0);
    expect(clampPlayheadMs(500, 1000)).toBe(500);
    expect(clampPlayheadMs(2000, 1000)).toBe(1000);
  });

  it("computes clip end", () => {
    expect(clipEndMs({ timelineStartMs: 1000, durationMs: 500 })).toBe(1500);
  });
});

describe("P5.1 StudioTransport ≠ catalog player", () => {
  it("play/pause/stop/seek/tick", () => {
    let state = createStudioTransportState(5000);
    state = reduceStudioTransport(state, { type: "PLAY" });
    expect(state.phase).toBe("playing");
    state = reduceStudioTransport(state, { type: "TICK", deltaMs: 250 });
    expect(state.playheadMs).toBe(250);
    state = reduceStudioTransport(state, { type: "PAUSE" });
    expect(state.phase).toBe("paused");
    state = reduceStudioTransport(state, { type: "SEEK", playheadMs: 1000 });
    expect(state.playheadMs).toBe(1000);
    state = reduceStudioTransport(state, { type: "STOP" });
    expect(state.phase).toBe("stopped");
    expect(state.playheadMs).toBe(0);
  });

  it("stops at timeline end", () => {
    let state = createStudioTransportState(1000);
    state = reduceStudioTransport(state, { type: "PLAY" });
    state = reduceStudioTransport(state, { type: "TICK", deltaMs: 1500 });
    expect(state.phase).toBe("stopped");
    expect(state.playheadMs).toBe(1000);
  });
});

describe("P5.1 track ops", () => {
  it("reorders up/down", () => {
    const ids = ["a", "b", "c"];
    expect(reorderTrackIds({ orderedIds: ids, trackId: "b", direction: "up" })).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(
      reorderTrackIds({ orderedIds: ids, trackId: "b", direction: "down" }),
    ).toEqual(["a", "c", "b"]);
  });

  it("applies sort orders", () => {
    expect(applySortOrders(["x", "y"])).toEqual([
      { id: "x", sortOrder: 0 },
      { id: "y", sortOrder: 1 },
    ]);
  });

  it("solo/mute audible rules", () => {
    expect(isTrackAudible({ muted: true, solo: true, anySolo: true })).toBe(false);
    expect(isTrackAudible({ muted: false, solo: false, anySolo: true })).toBe(
      false,
    );
    expect(isTrackAudible({ muted: false, solo: true, anySolo: true })).toBe(true);
    expect(isTrackAudible({ muted: false, solo: false, anySolo: false })).toBe(
      true,
    );
  });

  it("track types stay extensible (not vocal-only)", () => {
    expect(STUDIO_TRACK_TYPES).toContain("VOCAL");
    expect(STUDIO_TRACK_TYPES).toContain("BEAT");
    expect(STUDIO_TRACK_TYPES).toContain("SAMPLE");
    expect(STUDIO_TRACK_TYPES).toContain("GUITAR");
  });
});

describe("P5.1 clip source XOR + placement", () => {
  it("accepts TAKE-only source", () => {
    expect(() =>
      assertValidClipSource({
        sourceKind: "TAKE",
        sourceTakeId: "00000000-0000-4000-8000-000000000001",
      }),
    ).not.toThrow();
  });

  it("rejects mixed sources", () => {
    expect(() =>
      assertValidClipSource({
        sourceKind: "TAKE",
        sourceTakeId: "00000000-0000-4000-8000-000000000001",
        sourceBeatId: "00000000-0000-4000-8000-000000000002",
      }),
    ).toThrow(/TAKE/);
  });

  it("rejects clip past timeline", () => {
    expect(() =>
      assertClipPlacement({
        timelineStartMs: 900,
        durationMs: 200,
        sourceOffsetMs: 0,
        timelineLengthMs: 1000,
      }),
    ).toThrow(/exceeds/);
  });
});

describe("P5.1 security / schema / regression guards", () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20261006051500_p5_1_studio_project_track_clip_foundation.sql",
    ),
    "utf8",
  );

  it("migration enforces service_role mutations + RLS select own", () => {
    expect(migration).toMatch(/Only service_role may mutate studio_projects/);
    expect(migration).toMatch(/Only service_role may mutate studio_tracks/);
    expect(migration).toMatch(/Only service_role may mutate studio_clips/);
    expect(migration).toMatch(/studio_projects_select_own/);
    expect(migration).toMatch(/studio_clips_source_xor_chk/);
    expect(migration).toMatch(/timeline_start_ms integer/);
  });

  it("does not alter takes ownership XOR", () => {
    expect(migration).not.toMatch(/ALTER TABLE public\.takes/);
    expect(migration).not.toMatch(/takes_owner_xor/);
  });

  it("soft project cap configured", () => {
    expect(STUDIO_MAX_PROJECTS_PER_USER).toBe(25);
  });

  it("StudioTransport module stays separate from PlayerProvider", () => {
    const transportSrc = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-transport.ts"),
      "utf8",
    );
    expect(transportSrc).toMatch(/Distinct from PlayerProvider/);
    expect(transportSrc).not.toMatch(/player-provider/);
  });

  it("P3/P4 take APIs untouched by studio service imports of take-transport", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).not.toMatch(/take-transport/);
    expect(service).not.toMatch(/anon-account-claim/);
    expect(service).toMatch(/assertOwnsProject/);
  });
});
