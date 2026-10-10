/**
 * SFM-1 / SFM-1.1 — session interpretation contract (pure, no Storage / Contabo).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { gainDbToLinearVolume } from "@/lib/studio/studio-beat-audio";
import {
  clipGraphGain,
  masterGraphParams,
  planVoicesAtPlayhead,
  trackGraphParams,
  type StudioEngineClip,
  type StudioEngineDocument,
  type StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  effectiveClipGain,
  fadeEnvelopeAt,
} from "@/lib/studio/studio-clip-fade";
import {
  addStudioFxToChain,
  emptyStudioFxChain,
  readStudioFxChain,
} from "@/lib/studio/studio-fx-chain";
import { normalizePan } from "@/lib/studio/studio-track-ops";
import {
  interpretFxChainField,
  interpretStudioSessionAtPlayhead,
} from "@/lib/studio/studio-session-interpretation";

/** Valid v1 chain via existing writer helper (UUID ids). */
const validTrackFx = addStudioFxToChain(emptyStudioFxChain(), "eq", "track");

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
    durationMs: 10_000,
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
    timelineLengthMs: 60_000,
    masterGainDb: 0,
    masterPan: 0,
    projectBeatId: "beat-1",
    ...partial,
  };
}

describe("SFM-1 interpretStudioSessionAtPlayhead", () => {
  it("reuses planVoicesAtPlayhead membership (no fork of schedule)", () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 1000,
          durationMs: 5000,
          sourceOffsetMs: 200,
        }),
      ],
    });
    const playheadMs = 2500;
    const planned = planVoicesAtPlayhead(document, playheadMs);
    const interpreted = interpretStudioSessionAtPlayhead(document, playheadMs);
    expect(interpreted.voices.map((v) => v.clipId)).toEqual(
      planned.map((p) => p.clipId),
    );
    expect(interpreted.voices[0]?.sourceOffsetSeconds).toBe(
      planned[0]?.sourceOffsetSeconds,
    );
    expect(interpreted.voices[0]?.remainingMs).toBe(planned[0]?.remainingMs);
  });

  it("maps sourceOffsetMs / duration / timeline geometry at playhead", () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 1000,
          durationMs: 8000,
          sourceOffsetMs: 500,
        }),
      ],
    });
    const playheadMs = 3500; // local = 2500
    const v = interpretStudioSessionAtPlayhead(document, playheadMs).voices[0];
    expect(v).toBeDefined();
    expect(v!.localMs).toBe(2500);
    expect(v!.sourceOffsetMs).toBe(500 + 2500);
    expect(v!.durationMs).toBe(8000);
    expect(v!.timelineStartMs).toBe(1000);
    expect(v!.sourceOffsetSeconds).toBeCloseTo(v!.sourceOffsetMs / 1000, 8);
  });

  it("exposes sourceTakeId / sourceBeatId from clip document fields only", () => {
    const document = doc({
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [
        clip({
          id: "take-clip",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-abc",
          sourceBeatId: null,
          timelineStartMs: 0,
          durationMs: 4000,
        }),
        clip({
          id: "beat-clip",
          trackId: "t2",
          sourceKind: "BEAT_REF",
          sourceTakeId: null,
          sourceBeatId: "beat-1",
          timelineStartMs: 0,
          durationMs: 4000,
        }),
      ],
    });
    const voices = interpretStudioSessionAtPlayhead(document, 500).voices;
    const take = voices.find((v) => v.clipId === "take-clip")!;
    const beat = voices.find((v) => v.clipId === "beat-clip")!;
    expect(take.sourceTakeId).toBe("take-abc");
    expect(take.sourceBeatId).toBeNull();
    expect(beat.sourceBeatId).toBe("beat-1");
    expect(beat.sourceTakeId).toBeNull();
  });

  it("applies fade-in / fade-out via existing fadeEnvelopeAt + effectiveClipGain", () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 5000,
          fadeInMs: 1000,
          fadeOutMs: 1000,
          gainDb: 0,
        }),
      ],
    });

    const mid = interpretStudioSessionAtPlayhead(document, 2000).voices[0]!;
    expect(mid.fadeEnvelope).toBe(1);
    expect(mid.effectiveClipGain).toBe(1);

    const fadeIn = interpretStudioSessionAtPlayhead(document, 500).voices[0]!;
    expect(fadeIn.fadeEnvelope).toBeCloseTo(0.5, 8);
    expect(fadeIn.fadeEnvelope).toBe(
      fadeEnvelopeAt(500, 1000, 1000, 5000),
    );
    expect(fadeIn.effectiveClipGain).toBe(
      effectiveClipGain(document.clips[0]!, 500),
    );

    const fadeOut = interpretStudioSessionAtPlayhead(document, 4500).voices[0]!;
    expect(fadeOut.fadeEnvelope).toBeCloseTo(0.5, 8);
    expect(fadeOut.effectiveClipGain).toBeCloseTo(0.5, 8);
  });

  it("honors clip mute (no voice) and track mute/solo via schedule", () => {
    const tracks = [
      track({ id: "t1", muted: true }),
      track({ id: "t2", solo: true }),
      track({ id: "t3" }),
    ];
    const clips = [
      clip({
        id: "muted-clip",
        trackId: "t2",
        sourceKind: "TAKE",
        muted: true,
        timelineStartMs: 0,
        durationMs: 4000,
      }),
      clip({
        id: "on-muted-track",
        trackId: "t1",
        sourceKind: "TAKE",
        timelineStartMs: 0,
        durationMs: 4000,
      }),
      clip({
        id: "solo-track",
        trackId: "t2",
        sourceKind: "TAKE",
        timelineStartMs: 0,
        durationMs: 4000,
      }),
      clip({
        id: "non-solo",
        trackId: "t3",
        sourceKind: "TAKE",
        timelineStartMs: 0,
        durationMs: 4000,
      }),
    ];
    const document = doc({ tracks, clips });
    const ids = interpretStudioSessionAtPlayhead(document, 1000).voices.map(
      (v) => v.clipId,
    );
    expect(ids).toEqual(["solo-track"]);
    expect(interpretStudioSessionAtPlayhead(document, 1000).anySolo).toBe(true);
  });

  it("zeros trackGain when track muted even if voice filtered separately", () => {
    const document = doc({
      tracks: [track({ id: "t1", muted: true, gainDb: 0 })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 3000,
        }),
      ],
    });
    expect(interpretStudioSessionAtPlayhead(document, 500).voices).toEqual([]);
  });

  it("composes clip base gain with envelope (reuse clipGraphGain)", () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 4000,
          fadeInMs: 2000,
          gainDb: -6,
        }),
      ],
    });
    const v = interpretStudioSessionAtPlayhead(document, 1000).voices[0]!;
    expect(v.baseClipGain).toBe(clipGraphGain({ gainDb: -6, muted: false }));
    expect(v.effectiveClipGain).toBeCloseTo(v.baseClipGain * v.fadeEnvelope, 8);
  });

  it("SFM-1.1: two overlapping clips → two active voices (mix)", () => {
    const document = doc({
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [
        clip({
          id: "left",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-a",
          timelineStartMs: 0,
          durationMs: 5000,
        }),
        clip({
          id: "right",
          trackId: "t2",
          sourceKind: "BEAT_REF",
          sourceBeatId: "beat-1",
          timelineStartMs: 2000,
          durationMs: 5000,
        }),
      ],
    });
    const playheadMs = 3000;
    const planned = planVoicesAtPlayhead(document, playheadMs);
    const interpreted = interpretStudioSessionAtPlayhead(document, playheadMs);
    expect(planned.map((p) => p.clipId).sort()).toEqual(["left", "right"]);
    expect(interpreted.voices.map((v) => v.clipId).sort()).toEqual([
      "left",
      "right",
    ]);
    expect(interpreted.voices).toHaveLength(2);
  });

  it("SFM-1.1: trackPan matches trackGraphParams / normalizePan", () => {
    const t1 = track({ id: "t1", pan: -0.4 });
    const document = doc({
      tracks: [t1],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 3000,
        }),
      ],
    });
    const v = interpretStudioSessionAtPlayhead(document, 500).voices[0]!;
    const expected = trackGraphParams(t1, false);
    expect(v.trackPan).toBe(expected.pan);
    expect(v.trackPan).toBe(normalizePan(-0.4));
  });

  it("SFM-1.1: master.gain matches masterGraphParams / gainDbToLinearVolume", () => {
    const document = doc({
      masterGainDb: -6,
      masterPan: 0.2,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 2000,
        }),
      ],
    });
    const interpreted = interpretStudioSessionAtPlayhead(document, 100);
    const expected = masterGraphParams(document);
    expect(interpreted.master.gain).toBe(expected.gain);
    expect(interpreted.master.gain).toBe(gainDbToLinearVolume(-6));
    expect(interpreted.master.pan).toBe(expected.pan);
  });

  it("SFM-1.1: FX typed StudioFxChainV1 | null via readStudioFxChain semantics", () => {
    expect(interpretFxChainField(null, "track")).toBeNull();
    expect(interpretFxChainField(undefined, "master")).toBeNull();

    const valid = interpretFxChainField(validTrackFx, "track");
    expect(valid).toEqual(readStudioFxChain(validTrackFx, "track"));
    expect(valid?.schemaVersion).toBe(1);
    expect(valid?.effects).toHaveLength(1);

    const empty = emptyStudioFxChain();
    expect(interpretFxChainField(empty, "track")).toEqual(empty);

    const invalid = { schemaVersion: 99, effects: "nope" };
    expect(interpretFxChainField(invalid, "track")).toEqual(
      readStudioFxChain(invalid, "track"),
    );
    expect(interpretFxChainField(invalid, "track")).toEqual(
      emptyStudioFxChain(),
    );

    const document = doc({
      masterFxChain: validTrackFx,
      tracks: [track({ id: "t1", effectsChain: invalid })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 2000,
        }),
      ],
    });
    // master role: valid eq-only chain is OK for read (master limiter-last is write-path)
    const out = interpretStudioSessionAtPlayhead(document, 100);
    expect(out.masterFxChain).toEqual(readStudioFxChain(validTrackFx, "master"));
    expect(out.voices[0]!.trackEffectsChain).toEqual(emptyStudioFxChain());
  });

  it("is stable for identical input", () => {
    const document = doc({
      tracks: [
        track({ id: "t1", pan: -0.25, gainDb: -3, effectsChain: validTrackFx }),
        track({ id: "t2", solo: true }),
      ],
      clips: [
        clip({
          id: "a",
          trackId: "t2",
          sourceKind: "BEAT_REF",
          sourceBeatId: "beat-1",
          timelineStartMs: 0,
          durationMs: 10_000,
          fadeInMs: 500,
          fadeOutMs: 500,
        }),
        clip({
          id: "b",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 2000,
          durationMs: 4000,
          sourceOffsetMs: 100,
        }),
      ],
      masterGainDb: -1,
      masterPan: 0.1,
      masterFxChain: null,
    });
    const a = interpretStudioSessionAtPlayhead(document, 2500);
    const b = interpretStudioSessionAtPlayhead(document, 2500);
    expect(a).toEqual(b);
    expect(a.voices.map((v) => v.clipId)).toEqual(["a"]);
    expect(a.master.pan).toBeCloseTo(0.1, 8);
    expect(a.masterFxChain).toBeNull();
    expect(a.voices[0]!.sourceBeatId).toBe("beat-1");
  });

  it("edge: outside clip window / zero duration → empty voices", () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 1000,
          durationMs: 1000,
        }),
        clip({
          id: "zero",
          trackId: "t1",
          sourceKind: "TAKE",
          timelineStartMs: 0,
          durationMs: 0,
        }),
      ],
    });
    expect(interpretStudioSessionAtPlayhead(document, 500).voices).toEqual([]);
    expect(interpretStudioSessionAtPlayhead(document, 2000).voices).toEqual([]);
    expect(
      interpretStudioSessionAtPlayhead(document, 1500).voices.map((v) => v.clipId),
    ).toEqual(["c1"]);
  });

  it("filters stale BEAT_REF when projectBeatId SSOT is set (AUD-01)", () => {
    const document = doc({
      projectBeatId: "beat-1",
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "stale",
          trackId: "t1",
          sourceKind: "BEAT_REF",
          sourceBeatId: "other-beat",
          timelineStartMs: 0,
          durationMs: 5000,
        }),
        clip({
          id: "ok",
          trackId: "t1",
          sourceKind: "BEAT_REF",
          sourceBeatId: "beat-1",
          timelineStartMs: 0,
          durationMs: 5000,
        }),
      ],
    });
    expect(
      interpretStudioSessionAtPlayhead(document, 100).voices.map((v) => v.clipId),
    ).toEqual(["ok"]);
  });

  it("module is a thin compose — does not redefine planVoicesAtPlayhead", () => {
    const src = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-session-interpretation.ts"),
      "utf8",
    );
    expect(src).toMatch(/planVoicesAtPlayhead\(/);
    expect(src).toMatch(/effectiveClipGain\(/);
    expect(src).toMatch(/trackGraphParams\(/);
    expect(src).toMatch(/masterGraphParams\(/);
    expect(src).toMatch(/readStudioFxChain/);
    expect(src).not.toMatch(/function planVoicesAtPlayhead/);
    expect(src).not.toMatch(/function fadeEnvelopeAt/);
    expect(src).not.toMatch(/function parseStudioFxChainForWrite/);
    expect(src).not.toMatch(/OfflineAudioContext|FFmpeg|render_jobs|Contabo/);
  });
});
