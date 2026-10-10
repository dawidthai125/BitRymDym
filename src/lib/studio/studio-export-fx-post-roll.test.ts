/**
 * OD-SFM-F04 — FX post-roll policy unit tests (no Storage / worker).
 */

import { describe, expect, it } from "vitest";

import {
  addStudioFxToChain,
  emptyStudioFxChain,
} from "@/lib/studio/studio-fx-chain";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  computeStudioExportPostRollMs,
  planStudioExportDuration,
  resolveStudioExportDurationMs,
  STUDIO_EXPORT_FX_POST_ROLL_MAX_MS,
} from "@/lib/studio/studio-export-fx-post-roll";
import {
  STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
  StudioOfflineRenderError,
} from "@/lib/studio/studio-offline-render";

function track(
  partial: Partial<StudioEngineTrack> & Pick<StudioEngineTrack, "id">,
): StudioEngineTrack {
  return {
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    ...partial,
  };
}

function clip(
  partial: Partial<StudioEngineClip> &
    Pick<StudioEngineClip, "id" | "trackId" | "sourceKind">,
): StudioEngineClip {
  return {
    sourceTakeId: partial.sourceKind === "TAKE" ? "take-1" : null,
    sourceBeatId: partial.sourceKind === "BEAT_REF" ? "beat-1" : null,
    sourceOffsetMs: 0,
    timelineStartMs: 0,
    durationMs: 1000,
    gainDb: 0,
    muted: false,
    fadeInMs: 0,
    fadeOutMs: 0,
    ...partial,
  };
}

function doc(
  partial: Partial<StudioEngineDocument> &
    Pick<StudioEngineDocument, "tracks" | "clips">,
): StudioEngineDocument {
  return {
    timelineLengthMs: 1000,
    masterGainDb: 0,
    masterPan: 0,
    projectBeatId: "beat-1",
    ...partial,
  };
}

describe("computeStudioExportPostRollMs", () => {
  it("returns 0 when no delay/reverb", () => {
    const d = doc({
      tracks: [track({ id: "t1" })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
    });
    expect(computeStudioExportPostRollMs(d)).toBe(0);
  });

  it("returns 0 for bypassed delay/reverb", () => {
    let chain = emptyStudioFxChain();
    chain = addStudioFxToChain(chain, "delay", "track");
    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "delay"
          ? { ...e, enabled: false, params: { ...e.params, mix: 0.5 } }
          : e,
      ),
    };
    const d = doc({
      tracks: [track({ id: "t1", effectsChain: chain })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
    });
    expect(computeStudioExportPostRollMs(d)).toBe(0);
  });

  it("returns 0 for enabled delay with mix=0", () => {
    let chain = emptyStudioFxChain();
    chain = addStudioFxToChain(chain, "delay", "track");
    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "delay"
          ? { ...e, enabled: true, params: { ...e.params, mix: 0 } }
          : e,
      ),
    };
    const d = doc({
      tracks: [track({ id: "t1", effectsChain: chain })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
    });
    expect(computeStudioExportPostRollMs(d)).toBe(0);
  });

  it("requests MAX post-roll for enabled wet delay", () => {
    let chain = emptyStudioFxChain();
    chain = addStudioFxToChain(chain, "delay", "track");
    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "delay"
          ? {
              ...e,
              enabled: true,
              params: { mix: 0.4, timeMs: 250, feedback: 0.5 },
            }
          : e,
      ),
    };
    const d = doc({
      tracks: [track({ id: "t1", effectsChain: chain })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
    });
    expect(computeStudioExportPostRollMs(d)).toBe(
      STUDIO_EXPORT_FX_POST_ROLL_MAX_MS,
    );
  });

  it("caps reverb post-roll by decay and MAX", () => {
    let chain = emptyStudioFxChain();
    chain = addStudioFxToChain(chain, "reverb", "master");
    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "reverb"
          ? {
              ...e,
              enabled: true,
              params: { mix: 0.3, decaySeconds: 1.2 },
            }
          : e,
      ),
    };
    const d = doc({
      tracks: [track({ id: "t1" })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
      masterFxChain: chain,
    });
    expect(computeStudioExportPostRollMs(d)).toBe(1200);

    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "reverb"
          ? {
              ...e,
              enabled: true,
              params: { mix: 0.3, decaySeconds: 6 },
            }
          : e,
      ),
    };
    const d2 = doc({
      tracks: [track({ id: "t1" })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
      masterFxChain: chain,
    });
    expect(computeStudioExportPostRollMs(d2)).toBe(
      STUDIO_EXPORT_FX_POST_ROLL_MAX_MS,
    );
  });
});

describe("resolveStudioExportDurationMs / planStudioExportDuration", () => {
  it("adds post-roll when FX require it", () => {
    let chain = emptyStudioFxChain();
    chain = addStudioFxToChain(chain, "delay", "track");
    chain = {
      ...chain,
      effects: chain.effects.map((e) =>
        e.type === "delay"
          ? {
              ...e,
              enabled: true,
              params: { mix: 0.5, timeMs: 200, feedback: 0.2 },
            }
          : e,
      ),
    };
    const d = doc({
      timelineLengthMs: 5000,
      tracks: [track({ id: "t1", effectsChain: chain })],
      clips: [clip({ id: "c1", trackId: "t1", sourceKind: "TAKE" })],
    });
    const plan = planStudioExportDuration(d);
    expect(plan.postRollMs).toBe(STUDIO_EXPORT_FX_POST_ROLL_MAX_MS);
    expect(plan.exportDurationMs).toBe(5000 + STUDIO_EXPORT_FX_POST_ROLL_MAX_MS);
    expect(plan.needsPostRoll).toBe(true);
  });

  it("fails closed when timeline + post-roll exceeds 180s (no silent trim)", () => {
    expect(() =>
      resolveStudioExportDurationMs({
        timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
        postRollMs: 1,
      }),
    ).toThrow(StudioOfflineRenderError);

    try {
      resolveStudioExportDurationMs({
        timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS - 1000,
        postRollMs: STUDIO_EXPORT_FX_POST_ROLL_MAX_MS,
      });
      expect.fail("expected TAIL_DURATION_CAP");
    } catch (e) {
      expect(e).toBeInstanceOf(StudioOfflineRenderError);
      expect((e as StudioOfflineRenderError).code).toBe(
        "STUDIO_RENDER_TAIL_DURATION_CAP",
      );
    }
  });

  it("allows exact 180s without post-roll", () => {
    const plan = resolveStudioExportDurationMs({
      timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
      postRollMs: 0,
    });
    expect(plan.exportDurationMs).toBe(STUDIO_OFFLINE_RENDER_MAX_DURATION_MS);
  });

  it("allows timeline + post-roll that fits under cap", () => {
    const plan = resolveStudioExportDurationMs({
      timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS - 3000,
      postRollMs: 3000,
    });
    expect(plan.exportDurationMs).toBe(STUDIO_OFFLINE_RENDER_MAX_DURATION_MS);
  });
});
