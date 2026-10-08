/**
 * AUD-01 — fail-closed attach semantics + engine stale BEAT_REF scheduling.
 */
import { describe, expect, it } from "vitest";

import { planVoicesAtPlayhead } from "@/lib/studio/studio-audio-schedule";
import type { StudioEngineDocument } from "@/lib/studio/studio-audio-schedule";
import {
  runAttachBeatFailClosed,
  type AttachBeatFailClosedOps,
  type BeatRefClipSnapshot,
} from "@/lib/studio/studio-service";

const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const TRACK = "33333333-3333-4333-8333-333333333333";
const OLD_CLIP = "44444444-4444-4444-8444-444444444444";

function oldSnapshot(): BeatRefClipSnapshot {
  return {
    id: OLD_CLIP,
    track_id: TRACK,
    source_kind: "BEAT_REF",
    source_take_id: null,
    source_beat_id: OLD,
    source_artifact_id: null,
    timeline_start_ms: 0,
    duration_ms: 60_000,
    source_offset_ms: 0,
    gain_db: 0,
    muted: false,
    fade_in_ms: 0,
    fade_out_ms: 0,
  };
}

type SimState = {
  projectBeatId: string | null;
  tempo: number;
  refs: Array<{ id: string; source_beat_id: string | null }>;
  restoreCalls: number;
  success: boolean;
};

function createSim(opts?: {
  failDelete?: boolean;
  failInsert?: boolean;
  failRestoreProject?: boolean;
  failRestoreClips?: boolean;
  initialBeatId?: string | null;
}): { state: SimState; ops: AttachBeatFailClosedOps } {
  const state: SimState = {
    projectBeatId: opts?.initialBeatId ?? OLD,
    tempo: 90,
    refs: [{ id: OLD_CLIP, source_beat_id: OLD }],
    restoreCalls: 0,
    success: false,
  };

  let nextClipSeq = 1;

  const ops: AttachBeatFailClosedOps = {
    async updateProjectBeat({ beatId, tempoBpm }) {
      state.projectBeatId = beatId;
      state.tempo = tempoBpm;
    },
    async deleteBeatRefIds(ids) {
      if (opts?.failDelete) throw new Error("DELETE_FAILED");
      state.refs = state.refs.filter((r) => !ids.includes(r.id));
    },
    async insertBeatRef({ beatId }) {
      if (opts?.failInsert) throw new Error("INSERT_FAILED");
      state.refs.push({
        id: `new-clip-${nextClipSeq++}`,
        source_beat_id: beatId,
      });
    },
    async listBeatRefsOnTrack() {
      return state.refs.map((r) => ({
        id: r.id,
        source_beat_id: r.source_beat_id,
      }));
    },
    async readProjectBeatId() {
      return state.projectBeatId;
    },
    async restoreProjectBeat({ beatId, tempoBpm }) {
      state.restoreCalls += 1;
      if (opts?.failRestoreProject) {
        throw new Error("RESTORE_PROJECT_FAILED");
      }
      state.projectBeatId = beatId;
      state.tempo = tempoBpm;
    },
    async replaceBeatRefsOnTrack({ rows }) {
      if (opts?.failRestoreClips) {
        throw new Error("RESTORE_CLIPS_FAILED");
      }
      state.refs = rows.map((r) => ({
        id: r.id,
        source_beat_id: r.source_beat_id,
      }));
    },
  };

  return { state, ops };
}

async function attachNew(
  ops: AttachBeatFailClosedOps,
  previousBeatRefs: BeatRefClipSnapshot[],
) {
  await runAttachBeatFailClosed({
    ops,
    requestedBeatId: NEW,
    tempoBpm: 128,
    beatDurationMs: 60_000,
    previousBeatId: OLD,
    previousTempoBpm: 90,
    previousBeatRefs,
    beatTrackId: TRACK,
  });
}

describe("AUD-01 runAttachBeatFailClosed", () => {
  it("A SUCCESS: OLD → NEW with exactly one NEW BEAT_REF", async () => {
    const { state, ops } = createSim();
    await attachNew(ops, [oldSnapshot()]);
    state.success = true;
    expect(state.projectBeatId).toBe(NEW);
    expect(state.refs).toHaveLength(1);
    expect(state.refs[0]!.source_beat_id).toBe(NEW);
    expect(state.restoreCalls).toBe(0);
  });

  it("B INSERT FAILURE: restore called, no success, prior binding restored", async () => {
    const { state, ops } = createSim({ failInsert: true });
    await expect(attachNew(ops, [oldSnapshot()])).rejects.toThrow(
      /INSERT_FAILED/,
    );
    expect(state.restoreCalls).toBe(1);
    expect(state.projectBeatId).toBe(OLD);
    expect(state.refs).toEqual([{ id: OLD_CLIP, source_beat_id: OLD }]);
  });

  it("C DELETE FAILURE: restore called, no success", async () => {
    const { state, ops } = createSim({ failDelete: true });
    await expect(attachNew(ops, [oldSnapshot()])).rejects.toThrow(
      /DELETE_FAILED/,
    );
    expect(state.restoreCalls).toBe(1);
    expect(state.projectBeatId).toBe(OLD);
    expect(state.refs.some((r) => r.source_beat_id === OLD)).toBe(true);
  });

  it("D RESTORE FAILURE: combined error, no success", async () => {
    const { state, ops } = createSim({
      failInsert: true,
      failRestoreProject: true,
    });
    await expect(attachNew(ops, [oldSnapshot()])).rejects.toThrow(
      /INSERT_FAILED \| RESTORE_PROJECT_FAILED/,
    );
    expect(state.restoreCalls).toBe(1);
    // Project restore failed — beat_id may remain NEW (residual).
    expect(state.projectBeatId).toBe(NEW);
  });

  it("E RETRY AFTER SUCCESSFUL RESTORE then succeeds", async () => {
    const first = createSim({ failInsert: true });
    await expect(attachNew(first.ops, [oldSnapshot()])).rejects.toThrow(
      /INSERT_FAILED/,
    );
    expect(first.state.projectBeatId).toBe(OLD);

    const second = createSim({
      initialBeatId: first.state.projectBeatId,
    });
    second.state.refs = [...first.state.refs];
    await attachNew(second.ops, [oldSnapshot()]);
    expect(second.state.projectBeatId).toBe(NEW);
    expect(second.state.refs).toHaveLength(1);
    expect(second.state.refs[0]!.source_beat_id).toBe(NEW);
  });

  it("F RETRY FROM PARTIAL STATE beat_id=NEW + BEAT_REF=OLD", async () => {
    const { state, ops } = createSim({ initialBeatId: NEW });
    state.refs = [{ id: OLD_CLIP, source_beat_id: OLD }];
    await runAttachBeatFailClosed({
      ops,
      requestedBeatId: NEW,
      tempoBpm: 128,
      beatDurationMs: 60_000,
      previousBeatId: NEW,
      previousTempoBpm: 128,
      previousBeatRefs: [
        {
          ...oldSnapshot(),
          source_beat_id: OLD,
        },
      ],
      beatTrackId: TRACK,
    });
    expect(state.projectBeatId).toBe(NEW);
    expect(state.refs).toHaveLength(1);
    expect(state.refs[0]!.source_beat_id).toBe(NEW);
    expect(state.refs.every((r) => r.source_beat_id !== OLD)).toBe(true);
  });
});

describe("AUD-01 engine stale BEAT_REF not scheduled", () => {
  it("G projectBeatId=NEW ignores BEAT_REF sourceBeatId=OLD in planVoices", () => {
    const doc: StudioEngineDocument = {
      timelineLengthMs: 120_000,
      masterGainDb: 0,
      masterPan: 0,
      projectBeatId: NEW,
      tracks: [
        {
          id: TRACK,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
        },
      ],
      clips: [
        {
          id: OLD_CLIP,
          trackId: TRACK,
          sourceKind: "BEAT_REF",
          sourceTakeId: null,
          sourceBeatId: OLD,
          sourceOffsetMs: 0,
          timelineStartMs: 0,
          durationMs: 60_000,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          trackId: TRACK,
          sourceKind: "BEAT_REF",
          sourceTakeId: null,
          sourceBeatId: NEW,
          sourceOffsetMs: 0,
          timelineStartMs: 0,
          durationMs: 60_000,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    };

    const plans = planVoicesAtPlayhead(doc, 1000);
    expect(plans).toHaveLength(1);
    expect(plans[0]!.clipId).toBe("55555555-5555-4555-8555-555555555555");
    expect(plans.every((p) => p.clipId !== OLD_CLIP)).toBe(true);
  });

  it("stale-only BEAT_REF yields no scheduled beat voice", () => {
    const doc: StudioEngineDocument = {
      timelineLengthMs: 120_000,
      masterGainDb: 0,
      masterPan: 0,
      projectBeatId: NEW,
      tracks: [
        {
          id: TRACK,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
        },
      ],
      clips: [
        {
          id: OLD_CLIP,
          trackId: TRACK,
          sourceKind: "BEAT_REF",
          sourceTakeId: null,
          sourceBeatId: OLD,
          sourceOffsetMs: 0,
          timelineStartMs: 0,
          durationMs: 60_000,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    };
    expect(planVoicesAtPlayhead(doc, 1000)).toEqual([]);
  });
});

describe("AUD-01 attach verify contracts (source)", () => {
  it("service verifies re-read project beat_id and rejects stale BEAT_REF", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/readProjectBeatId/);
    expect(service).toMatch(/Project beat_id consistency check failed/);
    expect(service).toMatch(/Stale BEAT_REF remains after attach/);
    expect(service).toMatch(/runAttachBeatFailClosed/);
  });
});
