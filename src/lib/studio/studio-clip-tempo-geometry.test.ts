import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clipSourceRate,
  durationAfterStretchMs,
  splitClipGeometry,
  trimClipLeft,
} from "@/lib/studio/studio-clip-ops";
import { previewTrimLeftToEdgeMs, previewTrimRightToEdgeMs } from "@/lib/studio/studio-clip-edit-preview";
import { bakedTimelineMs, bakedReverseTimelineMs } from "@/lib/studio/studio-clip-playback";

const clip = { timelineStartMs: 1000, durationMs: 8000, sourceOffsetMs: 500 };

describe("geometry of clips with changed tempo", () => {
  it("source rate: tempo slows the walk, reverse uses its own rate", () => {
    expect(clipSourceRate({})).toBe(1);
    expect(clipSourceRate({ stretchRatio: 2 })).toBe(0.5);
    expect(clipSourceRate({ stretchRatio: 0.5 })).toBe(2);
    expect(clipSourceRate({ scratchRate: 1.5 })).toBe(1);
    expect(clipSourceRate({ scratchReverse: true, scratchRate: 1.5 })).toBe(1.5);
  });

  it("split continues exactly where the left half stops", () => {
    for (const stretch of [0.5, 1, 1.25, 2]) {
      const { right } = splitClipGeometry({
        clip,
        atTimelineMs: 4000,
        timelineLengthMs: 60_000,
        sourceRate: clipSourceRate({ stretchRatio: stretch }),
      });
      const heardInOne = bakedTimelineMs({ sourceOffsetMs: clip.sourceOffsetMs, localMs: 3000, stretch });
      const heardInRight = bakedTimelineMs({ sourceOffsetMs: right.sourceOffsetMs, localMs: 0, stretch });
      expect(Math.abs(heardInOne - heardInRight)).toBeLessThanOrEqual(1);
    }
  });

  it("split of a reversed, stretched clip also continues", () => {
    const params = { stretch: 2, cueMs: 100, rate: 1.5, bakedDurationMs: 40_000 };
    const { right } = splitClipGeometry({
      clip,
      atTimelineMs: 4000,
      timelineLengthMs: 60_000,
      sourceRate: clipSourceRate({ stretchRatio: 2, scratchReverse: true, scratchRate: 1.5 }),
    });
    const one = bakedReverseTimelineMs({ sourceOffsetMs: clip.sourceOffsetMs, localMs: 3000, ...params });
    const two = bakedReverseTimelineMs({ sourceOffsetMs: right.sourceOffsetMs, localMs: 0, ...params });
    expect(Math.abs(one - two)).toBeLessThanOrEqual(1);
  });

  it("left trim skips the matching part of the source", () => {
    expect(trimClipLeft({ clip, trimMs: 1000, timelineLengthMs: 60_000, sourceRate: 0.5 }).sourceOffsetMs).toBe(1000);
    expect(trimClipLeft({ clip, trimMs: 1000, timelineLengthMs: 60_000 }).sourceOffsetMs).toBe(1500);
  });

  it("new tempo keeps the same part of the recording, within the project", () => {
    const base = { timelineStartMs: 1000, timelineLengthMs: 60_000 };
    expect(durationAfterStretchMs({ ...base, durationMs: 8000, fromStretch: 1, toStretch: 2 })).toBe(16_000);
    expect(durationAfterStretchMs({ ...base, durationMs: 16_000, fromStretch: 2, toStretch: 1 })).toBe(8000);
    expect(durationAfterStretchMs({ ...base, durationMs: 8000, fromStretch: 1, toStretch: 0.5 })).toBe(4000);
    expect(durationAfterStretchMs({ ...base, durationMs: 40_000, fromStretch: 1, toStretch: 2 })).toBe(59_000);
  });

  it("dragging an edge of a slowed-down clip is limited by the source it really uses", () => {
    const slow = { timelineStartMs: 0, durationMs: 16_000, sourceOffsetMs: 0 };
    const limits = { timelineLengthMs: 60_000, sourceDurationMs: 8000, sourceRate: 0.5 };
    expect(previewTrimRightToEdgeMs({ clip: slow, edgeTimelineMs: 14_000, ...limits })?.durationMs).toBe(14_000);
    expect(previewTrimLeftToEdgeMs({ clip: slow, edgeTimelineMs: 4000, ...limits })).toEqual({
      timelineStartMs: 4000,
      durationMs: 12_000,
      sourceOffsetMs: 2000,
    });
  });
});

describe("migration: copies keep pitch, tempo, reverse, notes and automation", () => {
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261123200000_studio_copies_keep_clip_playback.sql"),
    "utf8",
  );
  const body = (name: string) => {
    const from = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return sql.slice(from, sql.indexOf("REVOKE ALL", from));
  };
  const columns = ["scratch_cue_ms", "scratch_reverse", "scratch_rate", "stretch_ratio", "pitch_cents"];

  it.each(["studio_cas_apply_clip_split", "studio_cas_apply_clip_duplicate", "studio_cas_duplicate_track"])(
    "%s copies every playback column and keeps its checks",
    (name) => {
      const fn = body(name);
      for (const column of columns) expect(fn).toMatch(new RegExp(`c\\.${column}`));
      expect(fn).toMatch(/owner_id = p_owner_id/);
      expect(fn).toMatch(/document_version = p_expected|IS DISTINCT FROM p_expected/);
      expect(fn).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`));
    },
  );

  it("duplicate track keeps the capacity check and copies notes and automation", () => {
    const fn = body("studio_cas_duplicate_track");
    expect(fn).toMatch(/TRACK_CAPACITY_REACHED/);
    expect(fn).toMatch(/BEAT_TRACK_PROTECTED/);
    expect(fn).toMatch(/v_src\.automation,\s+v_src\.midi/);
  });
});
