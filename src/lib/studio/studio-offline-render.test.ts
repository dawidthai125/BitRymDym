/**
 * SFM-2 — offline Studio PCM renderer tests (synthetic fixtures only).
 */

import { describe, expect, it } from "vitest";

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import { addStudioFxToChain, emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import {
  applyLinearGainPanSample,
  renderStudioDocumentOffline,
  studioOfflineRenderOutputBytesForDurationMs,
  STUDIO_OFFLINE_RENDER_ENGINE,
  STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
  STUDIO_OFFLINE_RENDER_MAX_OUTPUT_BYTES,
  STUDIO_OFFLINE_RENDER_MAX_TOTAL_PCM_BYTES,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
  StudioOfflineRenderError,
  type StudioOfflinePcmResolver,
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

/** Constant stereo PCM (L=ampL, R=ampR). */
function constPcm(
  frames: number,
  ampL: number,
  ampR: number,
  sampleRate = STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
): DecodedPcmStereo {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    interleaved[i * 2] = ampL;
    interleaved[i * 2 + 1] = ampR;
  }
  return { sampleRate, channels: 2, interleaved, frames };
}

function impulsePcm(frames: number, atFrame: number, amp = 1): DecodedPcmStereo {
  const interleaved = new Float32Array(frames * 2);
  if (atFrame >= 0 && atFrame < frames) {
    interleaved[atFrame * 2] = amp;
    interleaved[atFrame * 2 + 1] = amp;
  }
  return {
    sampleRate: STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
    channels: 2,
    interleaved,
    frames,
  };
}

function resolverFromMap(
  map: Record<string, DecodedPcmStereo>,
): StudioOfflinePcmResolver {
  return (key) => {
    const k =
      key.kind === "TAKE" ? `TAKE:${key.takeId}` : `BEAT_REF:${key.beatId}`;
    return map[k] ?? null;
  };
}

function rmsChannel(interleaved: Float32Array, ch: 0 | 1): number {
  let s = 0;
  let n = 0;
  for (let i = ch; i < interleaved.length; i += 2) {
    const v = interleaved[i] ?? 0;
    s += v * v;
    n++;
  }
  return n ? Math.sqrt(s / n) : 0;
}

function meanChannel(interleaved: Float32Array, ch: 0 | 1): number {
  let s = 0;
  let n = 0;
  for (let i = ch; i < interleaved.length; i += 2) {
    s += interleaved[i] ?? 0;
    n++;
  }
  return n ? s / n : 0;
}

describe("SFM-2 renderStudioDocumentOffline", () => {
  it("1) single TAKE source on timeline → real PCM", async () => {
    const framesSrc = STUDIO_OFFLINE_RENDER_SAMPLE_RATE; // 1s
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(framesSrc, 0.5, 0.25),
      }),
    });
    expect(result.engineId).toBe(STUDIO_OFFLINE_RENDER_ENGINE);
    expect(result.sampleRate).toBe(STUDIO_OFFLINE_RENDER_SAMPLE_RATE);
    expect(result.frames).toBe(framesSrc);
    expect(meanChannel(result.interleaved, 0)).toBeCloseTo(0.5, 2);
    expect(meanChannel(result.interleaved, 1)).toBeCloseTo(0.25, 2);
    expect(result.peakAbs).toBeGreaterThan(0.2);
  });

  it("2) two overlapping clips sum (mix)", async () => {
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [
        clip({
          id: "a",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-a",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
        clip({
          id: "b",
          trackId: "t2",
          sourceKind: "BEAT_REF",
          sourceBeatId: "beat-1",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-a": constPcm(STUDIO_OFFLINE_RENDER_SAMPLE_RATE, 0.2, 0.2),
        "BEAT_REF:beat-1": constPcm(STUDIO_OFFLINE_RENDER_SAMPLE_RATE, 0.3, 0.3),
      }),
    });
    expect(meanChannel(result.interleaved, 0)).toBeCloseTo(0.5, 2);
  });

  it("3) non-zero clip start → silence before, signal after", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 500,
          durationMs: 500,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(sr, 1, 1),
      }),
    });
    const midEarly = Math.floor(sr * 0.25) * 2;
    const midLate = Math.floor(sr * 0.75) * 2;
    expect(result.interleaved[midEarly]).toBeCloseTo(0, 5);
    expect(result.interleaved[midLate]).toBeCloseTo(1, 2);
  });

  it("4) sourceOffsetMs / trim skips into media", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    // Impulse at 0.25s into source; clip starts at 0 with sourceOffset 250ms → impulse at t=0
    const pcm = impulsePcm(sr, Math.floor(sr * 0.25), 1);
    const document = doc({
      timelineLengthMs: 500,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 500,
          sourceOffsetMs: 250,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({ "TAKE:take-1": pcm }),
    });
    // Impulse should appear near frame 0 of output
    expect(Math.abs(result.interleaved[0]!)).toBeGreaterThan(0.5);
    expect(result.peakAbs).toBeGreaterThan(0.5);
  });

  it("5) fade-in / fade-out reduce edges vs center", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 1000,
          fadeInMs: 200,
          fadeOutMs: 200,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(sr, 1, 1),
      }),
    });
    const atStart = Math.abs(result.interleaved[Math.floor(sr * 0.05) * 2]!);
    const atMid = Math.abs(result.interleaved[Math.floor(sr * 0.5) * 2]!);
    const atEnd = Math.abs(result.interleaved[Math.floor(sr * 0.95) * 2]!);
    expect(atMid).toBeGreaterThan(atStart);
    expect(atMid).toBeGreaterThan(atEnd);
    expect(atStart).toBeLessThan(0.5);
  });

  it("6) clip gainDb attenuates", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const document = doc({
      timelineLengthMs: 200,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 200,
          gainDb: -6,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 1, 1),
      }),
    });
    expect(meanChannel(result.interleaved, 0)).toBeCloseTo(
      Math.pow(10, -6 / 20),
      2,
    );
  });

  it("7) track pan hard-left / hard-right", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const base = {
      timelineLengthMs: 200,
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    };
    const left = await renderStudioDocumentOffline({
      document: doc({
        ...base,
        tracks: [track({ id: "t1", pan: -1 })],
      }),
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 1, 1),
      }),
    });
    const right = await renderStudioDocumentOffline({
      document: doc({
        ...base,
        tracks: [track({ id: "t1", pan: 1 })],
      }),
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 1, 1),
      }),
    });
    expect(rmsChannel(left.interleaved, 0)).toBeGreaterThan(
      rmsChannel(left.interleaved, 1),
    );
    expect(rmsChannel(right.interleaved, 1)).toBeGreaterThan(
      rmsChannel(right.interleaved, 0),
    );
  });

  it("8) mute / solo exclude voices", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const document = doc({
      timelineLengthMs: 200,
      tracks: [
        track({ id: "t1", muted: true }),
        track({ id: "t2", solo: true }),
        track({ id: "t3" }),
      ],
      clips: [
        clip({
          id: "muted-track",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-m",
          timelineStartMs: 0,
          durationMs: 200,
        }),
        clip({
          id: "solo",
          trackId: "t2",
          sourceKind: "TAKE",
          sourceTakeId: "take-s",
          timelineStartMs: 0,
          durationMs: 200,
        }),
        clip({
          id: "other",
          trackId: "t3",
          sourceKind: "TAKE",
          sourceTakeId: "take-o",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-m": constPcm(Math.ceil(sr * 0.2), 1, 1),
        "TAKE:take-s": constPcm(Math.ceil(sr * 0.2), 0.4, 0.4),
        "TAKE:take-o": constPcm(Math.ceil(sr * 0.2), 1, 1),
      }),
    });
    expect(meanChannel(result.interleaved, 0)).toBeCloseTo(0.4, 2);
  });

  it("9) master gain attenuates mix", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const document = doc({
      timelineLengthMs: 200,
      masterGainDb: -6,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 1, 1),
      }),
    });
    expect(meanChannel(result.interleaved, 0)).toBeCloseTo(
      Math.pow(10, -6 / 20),
      2,
    );
  });

  it("10) source shorter than clip → silence after source ends", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const short = constPcm(Math.floor(sr * 0.2), 1, 1); // 200ms source
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({ "TAKE:take-1": short }),
    });
    const early = Math.abs(result.interleaved[Math.floor(sr * 0.1) * 2]!);
    const late = Math.abs(result.interleaved[Math.floor(sr * 0.8) * 2]!);
    expect(early).toBeGreaterThan(0.5);
    expect(late).toBeLessThan(0.01);
  });

  it("11) ARTIFACT unsupported — typed error", async () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "art",
          trackId: "t1",
          sourceKind: "ARTIFACT",
          sourceTakeId: null,
          sourceBeatId: null,
          timelineStartMs: 0,
          durationMs: 500,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: async () => null,
      }),
    ).rejects.toMatchObject({
      code: "STUDIO_RENDER_ARTIFACT_UNSUPPORTED",
    });
  });

  it("12) empty session — typed error", async () => {
    const document = doc({
      tracks: [track({ id: "t1", muted: true })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 500,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(1000, 1, 1),
        }),
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
  });

  it("13) duration cap — typed error", async () => {
    const document = doc({
      timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS + 1,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(1000, 1, 1),
        }),
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_DURATION_CAP" });
  });

  it("14) invalid PCM format — typed error", async () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": {
            sampleRate: 48000,
            channels: 2,
            frames: 100,
            interleaved: new Float32Array(200),
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_SOURCE_INVALID" });
  });

  it("15) empty FX OK; non-empty FX unsupported", async () => {
    const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;
    const baseClips = [
      clip({
        id: "c1",
        trackId: "t1",
        sourceKind: "TAKE",
        sourceTakeId: "take-1",
        timelineStartMs: 0,
        durationMs: 200,
      }),
    ];
    const dry = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 200,
        masterFxChain: null,
        tracks: [track({ id: "t1", effectsChain: emptyStudioFxChain() })],
        clips: baseClips,
      }),
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 0.5, 0.5),
      }),
    });
    expect(dry.peakAbs).toBeGreaterThan(0.1);

    // SFM-3D: empty FX dry OK; enabled eq + delay supported.
    const eq = addStudioFxToChain(emptyStudioFxChain(), "eq", "track");
    const withEq = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 200,
        tracks: [track({ id: "t1", effectsChain: eq })],
        clips: baseClips,
      }),
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 0.5, 0.5),
      }),
    });
    expect(withEq.peakAbs).toBeGreaterThan(0.1);

    const delay = addStudioFxToChain(emptyStudioFxChain(), "delay", "track");
    const withDelay = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 200,
        tracks: [track({ id: "t1", effectsChain: delay })],
        clips: baseClips,
      }),
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 0.5, 0.5),
      }),
    });
    expect(withDelay.frames).toBe(withEq.frames);
    expect(Number.isFinite(withDelay.peakAbs)).toBe(true);

    // Unsupported schema still fail-closed.
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          timelineLengthMs: 200,
          tracks: [
            track({
              id: "t1",
              effectsChain: { schemaVersion: 9, effects: [] },
            }),
          ],
          clips: baseClips,
        }),
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 0.5, 0.5),
        }),
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_FX_UNSUPPORTED" });
  });

  it("16) deterministic for identical inputs", async () => {
    const document = doc({
      timelineLengthMs: 300,
      tracks: [track({ id: "t1", pan: -0.2 })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 50,
          durationMs: 200,
          fadeInMs: 20,
          gainDb: -3,
        }),
      ],
    });
    const resolvePcm = resolverFromMap({
      "TAKE:take-1": constPcm(STUDIO_OFFLINE_RENDER_SAMPLE_RATE, 0.7, 0.3),
    });
    const a = await renderStudioDocumentOffline({ document, resolvePcm });
    const b = await renderStudioDocumentOffline({ document, resolvePcm });
    expect(a.frames).toBe(b.frames);
    expect(a.interleaved).toEqual(b.interleaved);
    expect(a.peakAbs).toBe(b.peakAbs);
    expect(a.rms).toBe(b.rms);
  });

  it("missing PCM → SOURCE_MISSING", async () => {
    const document = doc({
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "missing",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: async () => null,
      }),
    ).rejects.toBeInstanceOf(StudioOfflineRenderError);
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: async () => null,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_SOURCE_MISSING" });
  });
});

describe("SFM-2.1 numerical geometry / mix", () => {
  const sr = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;

  it("clip start/end on integer-ms sample boundary (silence outside)", async () => {
    // 100ms window → exactly sr/10 frames at 44100
    const startMs = 100;
    const durMs = 100;
    const document = doc({
      timelineLengthMs: 400,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: startMs,
          durationMs: durMs,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(sr, 1, 1),
      }),
    });
    const firstActive = Math.floor((startMs / 1000) * sr);
    const firstInactiveAfter = Math.floor(((startMs + durMs) / 1000) * sr);
    // Sample immediately before start
    expect(result.interleaved[(firstActive - 1) * 2]!).toBeCloseTo(0, 5);
    // First sample of active window
    expect(result.interleaved[firstActive * 2]!).toBeCloseTo(1, 2);
    // First sample at/after end is silent (membership uses >= end)
    expect(result.interleaved[firstInactiveAfter * 2]!).toBeCloseTo(0, 5);
  });

  it("exact known overlap interval: 0.5+0.5 → 1.0 only while both active", async () => {
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" }), track({ id: "t2" })],
      clips: [
        clip({
          id: "a",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-a",
          timelineStartMs: 0,
          durationMs: 600,
        }),
        clip({
          id: "b",
          trackId: "t2",
          sourceKind: "TAKE",
          sourceTakeId: "take-b",
          timelineStartMs: 400,
          durationMs: 600,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-a": constPcm(sr, 0.5, 0.5),
        "TAKE:take-b": constPcm(sr, 0.5, 0.5),
      }),
    });
    const f200 = Math.floor(0.2 * sr) * 2; // only A
    const f500 = Math.floor(0.5 * sr) * 2; // A+B
    const f800 = Math.floor(0.8 * sr) * 2; // only B
    expect(result.interleaved[f200]!).toBeCloseTo(0.5, 2);
    expect(result.interleaved[f500]!).toBeCloseTo(1.0, 2);
    expect(result.interleaved[f800]!).toBeCloseTo(0.5, 2);
  });

  it("samples before clip start and after clip end are zero", async () => {
    const document = doc({
      timelineLengthMs: 1000,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 300,
          durationMs: 200,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(sr, 0.8, 0.8),
      }),
    });
    expect(Math.abs(result.interleaved[Math.floor(0.1 * sr) * 2]!)).toBeLessThan(
      1e-6,
    );
    expect(Math.abs(result.interleaved[Math.floor(0.7 * sr) * 2]!)).toBeLessThan(
      1e-6,
    );
    expect(result.interleaved[Math.floor(0.4 * sr) * 2]!).toBeCloseTo(0.8, 2);
  });

  it("sourceOffset with source shorter than clip: early signal, late silence", async () => {
    // 100ms of media; clip 500ms starting at 0 with sourceOffset 0
    const shortFrames = Math.floor(sr * 0.1);
    const document = doc({
      timelineLengthMs: 500,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 500,
          sourceOffsetMs: 0,
        }),
      ],
    });
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(shortFrames, 1, 1),
      }),
    });
    expect(result.interleaved[0]!).toBeCloseTo(1, 2);
    expect(Math.abs(result.interleaved[Math.floor(0.3 * sr) * 2]!)).toBeLessThan(
      1e-6,
    );
  });

  it("stereo L/R preserved at pan=0; pan=-1 kills right", async () => {
    const document = doc({
      timelineLengthMs: 200,
      tracks: [track({ id: "t1", pan: 0 })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 200,
        }),
      ],
    });
    const centered = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({
        "TAKE:take-1": constPcm(Math.ceil(sr * 0.2), 0.6, 0.2),
      }),
    });
    expect(meanChannel(centered.interleaved, 0)).toBeCloseTo(0.6, 2);
    expect(meanChannel(centered.interleaved, 1)).toBeCloseTo(0.2, 2);

    // Pan law: leftG = g*min(1,1-p), rightG = g*min(1,1+p); pan=-1 → right silent.
    const hardLeft = applyLinearGainPanSample(0.6, 0.2, 1, -1);
    expect(hardLeft.right).toBeCloseTo(0, 5);
    expect(hardLeft.left).toBeCloseTo(0.6, 5);
  });

  it("SFM-2.2: default MAX_OUTPUT_BYTES equals max-duration stereo float32 size", () => {
    expect(STUDIO_OFFLINE_RENDER_MAX_OUTPUT_BYTES).toBe(
      studioOfflineRenderOutputBytesForDurationMs(
        STUDIO_OFFLINE_RENDER_MAX_DURATION_MS,
      ),
    );
    expect(STUDIO_OFFLINE_RENDER_MAX_TOTAL_PCM_BYTES).toBe(256 * 1024 * 1024);
  });

  it("SFM-2.2: render succeeds below public memory budgets", async () => {
    const durationMs = 200;
    const outputBytes = studioOfflineRenderOutputBytesForDurationMs(durationMs);
    const document = doc({
      timelineLengthMs: durationMs,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs,
        }),
      ],
    });
    const pcm = constPcm(Math.ceil(sr * (durationMs / 1000)), 0.25, 0.25);
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({ "TAKE:take-1": pcm }),
      maxOutputBytes: outputBytes,
      maxTotalPcmBytes: outputBytes + pcm.frames * pcm.channels * 4,
    });
    expect(result.frames).toBeGreaterThan(0);
    expect(result.engineId).toBe(STUDIO_OFFLINE_RENDER_ENGINE);
  });

  it("SFM-2.2: DURATION_CAP for timeline > 180s (not MEMORY_CAP)", async () => {
    const document = doc({
      timelineLengthMs: STUDIO_OFFLINE_RENDER_MAX_DURATION_MS + 1,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 1000,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(1000, 1, 1),
        }),
        // Even with absurdly tight memory budgets, duration must win first.
        maxOutputBytes: 8,
        maxTotalPcmBytes: 8,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_DURATION_CAP" });
  });

  it("SFM-2.2: MEMORY_CAP via maxOutputBytes within duration cap", async () => {
    const durationMs = 1_000;
    const needed = studioOfflineRenderOutputBytesForDurationMs(durationMs);
    const document = doc({
      timelineLengthMs: durationMs,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs,
        }),
      ],
    });
    let resolveCalls = 0;
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: () => {
          resolveCalls += 1;
          return constPcm(1000, 1, 1);
        },
        maxOutputBytes: needed - 1,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_MEMORY_CAP" });
    expect(resolveCalls).toBe(0);
  });

  it("SFM-2.2: MEMORY_CAP via maxTotalPcmBytes (sources + output)", async () => {
    const durationMs = 100;
    const outputBytes = studioOfflineRenderOutputBytesForDurationMs(durationMs);
    const pcm = constPcm(Math.ceil(sr * 0.1), 0.5, 0.5);
    const srcBytes = pcm.frames * pcm.channels * 4;
    const document = doc({
      timelineLengthMs: durationMs,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({ "TAKE:take-1": pcm }),
        maxOutputBytes: outputBytes,
        // Enough for output alone; not enough once source is cached.
        maxTotalPcmBytes: outputBytes + srcBytes - 1,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_MEMORY_CAP" });
  });

  it("SFM-2.2: MEMORY_CAP is not misclassified as DURATION_CAP", async () => {
    const durationMs = 500;
    const needed = studioOfflineRenderOutputBytesForDurationMs(durationMs);
    const document = doc({
      timelineLengthMs: durationMs,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs,
        }),
      ],
    });
    try {
      await renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(1000, 1, 1),
        }),
        maxOutputBytes: needed - 4,
      });
      expect.fail("expected MEMORY_CAP");
    } catch (err) {
      expect(err).toBeInstanceOf(StudioOfflineRenderError);
      expect((err as StudioOfflineRenderError).code).toBe(
        "STUDIO_RENDER_MEMORY_CAP",
      );
      expect((err as StudioOfflineRenderError).code).not.toBe(
        "STUDIO_RENDER_DURATION_CAP",
      );
    }
  });

  it("mono PCM rejected (channels !== 2)", async () => {
    const document = doc({
      timelineLengthMs: 100,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: 100,
        }),
      ],
    });
    const mono = {
      sampleRate: sr,
      channels: 1 as 2, // lie to type; runtime checks pcm.channels
      frames: 100,
      interleaved: new Float32Array(100),
    };
    // Force channels:1 through resolver with correct DecodedPcmStereo shape violation
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: () =>
          ({
            sampleRate: sr,
            channels: 1,
            frames: 100,
            interleaved: new Float32Array(100),
          }) as unknown as DecodedPcmStereo,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_SOURCE_INVALID" });
    void mono;
  });

  it("Stage G: exportDurationMs extends past timeline for FX post-roll", async () => {
    let delay = addStudioFxToChain(emptyStudioFxChain(), "delay", "track");
    delay = {
      ...delay,
      effects: delay.effects.map((e) =>
        e.type === "delay"
          ? {
              ...e,
              enabled: true,
              params: { mix: 0.8, timeMs: 50, feedback: 0.4 },
            }
          : e,
      ),
    };
    const timelineMs = 100;
    const exportMs = 150;
    const document = doc({
      timelineLengthMs: timelineMs,
      tracks: [track({ id: "t1", effectsChain: delay })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          timelineStartMs: 0,
          durationMs: timelineMs,
        }),
      ],
    });
    // Impulse at start so delay rings into post-roll.
    const pcm = impulsePcm(Math.ceil(sr * 0.2), 0, 1);
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: resolverFromMap({ "TAKE:take-1": pcm }),
      exportDurationMs: exportMs,
    });
    expect(result.durationMs).toBe(exportMs);
    expect(result.frames).toBe(
      Math.max(1, Math.floor((exportMs / 1000) * sr)),
    );
    // Energy after timeline end should be non-zero when delay is wet.
    let energyAfter = 0;
    const startFrame = Math.floor((timelineMs / 1000) * sr);
    for (let i = startFrame; i < result.frames; i++) {
      const l = result.interleaved[i * 2] ?? 0;
      const r = result.interleaved[i * 2 + 1] ?? 0;
      energyAfter += l * l + r * r;
    }
    expect(energyAfter).toBeGreaterThan(0);
  });

  it("Stage G: exportDurationMs < timeline rejected", async () => {
    const document = doc({
      timelineLengthMs: 500,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "take-1",
          durationMs: 500,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: resolverFromMap({
          "TAKE:take-1": constPcm(1000, 0.5, 0.5),
        }),
        exportDurationMs: 100,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_DURATION_CAP" });
  });

  it("Stage G: missing PCM fails SOURCE_MISSING", async () => {
    const document = doc({
      timelineLengthMs: 100,
      tracks: [track({ id: "t1" })],
      clips: [
        clip({
          id: "c1",
          trackId: "t1",
          sourceKind: "TAKE",
          sourceTakeId: "missing",
          durationMs: 100,
        }),
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document,
        resolvePcm: () => null,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_SOURCE_MISSING" });
  });
});
