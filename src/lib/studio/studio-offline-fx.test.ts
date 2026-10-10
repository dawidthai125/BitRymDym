/**
 * SFM-3A/3B/3C — offline FX contract + EQ/dynamics adapter tests (synthetic PCM).
 */

import { describe, expect, it } from "vitest";

import {
  addStudioFxToChain,
  defaultStudioFxParams,
  emptyStudioFxChain,
  type StudioFxChainV1,
  type StudioFxCompressorParams,
  type StudioFxEqParams,
  type StudioFxLimiterParams,
} from "@/lib/studio/studio-fx-chain";
import {
  buildStudioOfflineFxChain,
  createCompressorProcessorAtRate,
  createDelayProcessorAtRate,
  createEqProcessorAtRate,
  createLimiterProcessorAtRate,
  createReverbProcessorAtRate,
  STUDIO_OFFLINE_FX_IMPLEMENTED,
  StudioOfflineFxError,
} from "@/lib/studio/studio-offline-fx";
import {
  delayBufferBytes,
  delaySamplesForTimeMs,
} from "@/lib/studio/studio-offline-fx-delay";
import {
  STUDIO_OFFLINE_REVERB_BLOCK_SIZE,
} from "@/lib/studio/studio-offline-fx-reverb";
import {
  createSeededUnitRandom,
  fillStudioSyntheticImpulse,
  studioImpulsePcmBytes,
  studioOfflineImpulseSeed,
} from "@/lib/studio/studio-fx-impulse";
import {
  computeBiquadCoeffs,
  createStereoBiquadState,
  processStereoBiquadSample,
} from "@/lib/studio/studio-offline-fx-biquad";
import {
  dbToLinear,
  linearToDb,
  softKneeOutputDb,
  staticGainReductionDb,
} from "@/lib/studio/studio-offline-fx-dynamics";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
} from "@/lib/studio/studio-offline-render";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";

const SR = STUDIO_OFFLINE_RENDER_SAMPLE_RATE;

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

function sinePcm(
  frames: number,
  freqHz: number,
  amp = 0.5,
): { sampleRate: number; channels: 2; frames: number; interleaved: Float32Array } {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const s = amp * Math.sin((2 * Math.PI * freqHz * i) / SR);
    interleaved[i * 2] = s;
    interleaved[i * 2 + 1] = s;
  }
  return { sampleRate: SR, channels: 2, frames, interleaved };
}

function eqChain(params: StudioFxEqParams, enabled = true): StudioFxChainV1 {
  const base = addStudioFxToChain(emptyStudioFxChain(), "eq", "track");
  const effect = base.effects[0]!;
  return {
    schemaVersion: 1,
    effects: [
      {
        id: effect.id,
        type: "eq",
        enabled,
        params,
      },
    ],
  };
}

describe("SFM-3A offline FX contract", () => {
  it("all five Studio FX types are marked implemented", () => {
    expect([...STUDIO_OFFLINE_FX_IMPLEMENTED].sort()).toEqual([
      "compressor",
      "delay",
      "eq",
      "limiter",
      "reverb",
    ]);
  });

  it("empty chain → null handle (dry)", () => {
    expect(buildStudioOfflineFxChain(null, "track", SR)).toBeNull();
    expect(
      buildStudioOfflineFxChain(emptyStudioFxChain(), "track", SR),
    ).toBeNull();
  });

  it("unsupported schema → typed error (not silent dry)", () => {
    expect(() =>
      buildStudioOfflineFxChain({ schemaVersion: 9, effects: [] }, "track", SR),
    ).toThrow(StudioOfflineFxError);
    try {
      buildStudioOfflineFxChain({ schemaVersion: 9, effects: [] }, "master", SR);
      expect.fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(StudioOfflineFxError);
      expect((err as StudioOfflineFxError).code).toBe(
        "STUDIO_OFFLINE_FX_UNSUPPORTED",
      );
    }
  });

  it("enabled delay/reverb build without throw", () => {
    const delay = addStudioFxToChain(emptyStudioFxChain(), "delay", "track");
    const reverb = addStudioFxToChain(emptyStudioFxChain(), "reverb", "track");
    expect(buildStudioOfflineFxChain(delay, "track", SR)).not.toBeNull();
    expect(buildStudioOfflineFxChain(reverb, "track", SR)).not.toBeNull();
  });

  it("bypassed delay → wire passthrough (no DSP required)", () => {
    const chain = addStudioFxToChain(emptyStudioFxChain(), "delay", "track");
    const disabled: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [{ ...chain.effects[0]!, enabled: false }],
    };
    const handle = buildStudioOfflineFxChain(disabled, "track", SR);
    expect(handle).not.toBeNull();
    const out = handle!.process({ left: 0.25, right: -0.5 });
    expect(out.left).toBe(0.25);
    expect(out.right).toBe(-0.5);
  });
});

describe("SFM-3B EQ biquad / adapter", () => {
  it("flat EQ (~0 dB) is near-identity on DC after settle", () => {
    const params = defaultStudioFxParams("eq");
    const proc = createEqProcessorAtRate(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "eq",
        enabled: true,
        params,
      },
      SR,
    );
    // Drive with DC; after transient, output ≈ input (cookbook unity at 0 dB).
    let last = 0;
    for (let i = 0; i < 2048; i++) {
      last = proc.process({ left: 0.4, right: 0.4 }).left;
    }
    expect(last).toBeCloseTo(0.4, 3);
  });

  it("silence in → near silence out", () => {
    const params = defaultStudioFxParams("eq");
    params.mid.gainDb = 6;
    const proc = createEqProcessorAtRate(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "eq",
        enabled: true,
        params,
      },
      SR,
    );
    for (let i = 0; i < 256; i++) {
      const o = proc.process({ left: 0, right: 0 });
      expect(Math.abs(o.left)).toBeLessThan(1e-12);
      expect(Math.abs(o.right)).toBeLessThan(1e-12);
    }
  });

  it("peaking boost raises RMS of mid-band sine vs cut", () => {
    const frames = SR; // 1s
    const freq = 1000;
    const boost = defaultStudioFxParams("eq");
    boost.mid = { frequencyHz: 1000, gainDb: 6, q: 1 };
    const cut = defaultStudioFxParams("eq");
    cut.mid = { frequencyHz: 1000, gainDb: -6, q: 1 };

    const boostProc = createEqProcessorAtRate(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "eq",
        enabled: true,
        params: boost,
      },
      SR,
    );
    const cutProc = createEqProcessorAtRate(
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "eq",
        enabled: true,
        params: cut,
      },
      SR,
    );

    let sumBoost = 0;
    let sumCut = 0;
    // Skip first 0.1s transient; measure steady-state energy.
    for (let i = 0; i < frames; i++) {
      const x = 0.5 * Math.sin((2 * Math.PI * freq * i) / SR);
      const b = boostProc.process({ left: x, right: x }).left;
      const c = cutProc.process({ left: x, right: x }).left;
      if (i > frames * 0.1) {
        sumBoost += b * b;
        sumCut += c * c;
      }
    }
    const n = frames * 0.9;
    const rmsBoost = Math.sqrt(sumBoost / n);
    const rmsCut = Math.sqrt(sumCut / n);
    // 6 dB ≈ ×2 linear amplitude → ×4 power; allow algorithm settle tolerance.
    expect(rmsBoost / rmsCut).toBeGreaterThan(3.2);
    expect(rmsBoost).toBeGreaterThan(rmsCut);
  });

  it("stereo channels stay independent under asymmetric input", () => {
    const params = defaultStudioFxParams("eq");
    params.high.gainDb = 3;
    const proc = createEqProcessorAtRate(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "eq",
        enabled: true,
        params,
      },
      SR,
    );
    let maxR = 0;
    for (let i = 0; i < 512; i++) {
      const o = proc.process({ left: 0.8, right: 0 });
      maxR = Math.max(maxR, Math.abs(o.right));
    }
    // Right stays ~0 (numerical bleed only).
    expect(maxR).toBeLessThan(1e-9);
  });

  it("state continuity: split vs continuous processing match", () => {
    const params = defaultStudioFxParams("eq");
    params.low.gainDb = 4;
    const a = createEqProcessorAtRate(
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        type: "eq",
        enabled: true,
        params,
      },
      SR,
    );
    const b = createEqProcessorAtRate(
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        type: "eq",
        enabled: true,
        params,
      },
      SR,
    );
    const seq: number[] = [];
    for (let i = 0; i < 300; i++) {
      seq.push(Math.sin(i * 0.07));
    }
    const outA: number[] = [];
    for (const x of seq) {
      outA.push(a.process({ left: x, right: x }).left);
    }
    const outB: number[] = [];
    for (let i = 0; i < 150; i++) {
      outB.push(b.process({ left: seq[i]!, right: seq[i]! }).left);
    }
    for (let i = 150; i < 300; i++) {
      outB.push(b.process({ left: seq[i]!, right: seq[i]! }).left);
    }
    for (let i = 0; i < 300; i++) {
      expect(outA[i]).toBeCloseTo(outB[i]!, 10);
    }
  });

  it("determinism: identical params + input → identical output", () => {
    const params = defaultStudioFxParams("eq");
    params.mid.gainDb = -3;
    const mk = () =>
      createEqProcessorAtRate(
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "eq",
          enabled: true,
          params,
        },
        SR,
      );
    const p1 = mk();
    const p2 = mk();
    for (let i = 0; i < 128; i++) {
      const x = (i % 17) / 17;
      expect(p1.process({ left: x, right: -x })).toEqual(
        p2.process({ left: x, right: -x }),
      );
    }
  });

  it("boundary Q/frequency produce finite samples", () => {
    const coeffs = computeBiquadCoeffs("peaking", SR, 200, 12, 0.1);
    const state = createStereoBiquadState();
    for (let i = 0; i < 64; i++) {
      const o = processStereoBiquadSample(1, -1, coeffs, state);
      expect(Number.isFinite(o.left)).toBe(true);
      expect(Number.isFinite(o.right)).toBe(true);
    }
  });
});

describe("SFM-3B EQ integrated into offline render", () => {
  it("dry mix regression: empty FX matches no-chain path", async () => {
    const document = doc({
      timelineLengthMs: 200,
      tracks: [track({ id: "t1", effectsChain: emptyStudioFxChain() })],
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
    const pcm = sinePcm(Math.ceil(SR * 0.2), 440, 0.4);
    const result = await renderStudioDocumentOffline({
      document,
      resolvePcm: async () => pcm,
    });
    expect(result.peakAbs).toBeGreaterThan(0.2);
    expect(result.rms).toBeGreaterThan(0.1);
  });

  it("track EQ boost changes render vs flat defaults", async () => {
    const flat = eqChain(defaultStudioFxParams("eq"));
    const boostedParams = defaultStudioFxParams("eq");
    boostedParams.mid = { frequencyHz: 1000, gainDb: 9, q: 1 };
    const boosted = eqChain(boostedParams);
    const pcm = sinePcm(SR, 1000, 0.4);
    const clips = [
      clip({
        id: "c1",
        trackId: "t1",
        sourceKind: "TAKE",
        sourceTakeId: "take-1",
        timelineStartMs: 0,
        durationMs: 1000,
      }),
    ];
    const dryish = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 1000,
        tracks: [track({ id: "t1", effectsChain: flat })],
        clips,
      }),
      resolvePcm: async () => pcm,
    });
    const wet = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 1000,
        tracks: [track({ id: "t1", effectsChain: boosted })],
        clips,
      }),
      resolvePcm: async () => pcm,
    });
    // Skip startup; compare mid-window RMS. Tolerance: filter transient + float.
    const windowRms = (buf: Float32Array) => {
      let s = 0;
      const start = Math.floor(SR * 0.2);
      const end = Math.floor(SR * 0.9);
      for (let i = start; i < end; i++) {
        const v = buf[i * 2] ?? 0;
        s += v * v;
      }
      return Math.sqrt(s / (end - start));
    };
    const rDry = windowRms(dryish.interleaved);
    const rWet = windowRms(wet.interleaved);
    expect(rWet / rDry).toBeGreaterThan(2.0);
  });

  it("master EQ applies after track sum", async () => {
    const params = defaultStudioFxParams("eq");
    params.mid = { frequencyHz: 1000, gainDb: 6, q: 1 };
    const masterChain = addStudioFxToChain(emptyStudioFxChain(), "eq", "master");
    const withParams: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [
        {
          ...masterChain.effects[0]!,
          params,
        },
      ],
    };
    const pcm = sinePcm(Math.ceil(SR * 0.5), 1000, 0.35);
    const baseDoc = {
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
        }),
      ],
    };
    const without = await renderStudioDocumentOffline({
      document: doc(baseDoc),
      resolvePcm: async () => pcm,
    });
    const withFx = await renderStudioDocumentOffline({
      document: doc({ ...baseDoc, masterFxChain: withParams }),
      resolvePcm: async () => pcm,
    });
    expect(withFx.rms).toBeGreaterThan(without.rms * 1.4);
  });

  it("enabled delay renders (SFM-3D)", async () => {
    const chain = addStudioFxToChain(emptyStudioFxChain(), "delay", "track");
    const result = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 200,
        tracks: [track({ id: "t1", effectsChain: chain })],
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
      }),
      resolvePcm: async () => sinePcm(1000, 440),
    });
    expect(result.frames).toBeGreaterThan(0);
    expect(Number.isFinite(result.peakAbs)).toBe(true);
  });

  it("EQ + memory budget still enforced before large alloc", async () => {
    const chain = eqChain(defaultStudioFxParams("eq"));
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          timelineLengthMs: 1000,
          tracks: [track({ id: "t1", effectsChain: chain })],
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
        }),
        resolvePcm: async () => sinePcm(1000, 440),
        maxOutputBytes: 64,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_MEMORY_CAP" });
  });
});

describe("SFM-3C compressor + limiter", () => {
  const ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const ID_L = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  function compressorEffect(
    params: StudioFxCompressorParams,
    enabled = true,
  ) {
    return {
      id: ID_C,
      type: "compressor" as const,
      enabled,
      params,
    };
  }

  function limiterEffect(params: StudioFxLimiterParams, enabled = true) {
    return {
      id: ID_L,
      type: "limiter" as const,
      enabled,
      params,
    };
  }

  it("hard-knee static curve: below threshold → 0 dB GR", () => {
    const level = -30;
    const gr = staticGainReductionDb(level, -24, 0, 4);
    expect(gr).toBeCloseTo(0, 10);
    expect(softKneeOutputDb(level, -24, 0, 4)).toBeCloseTo(level, 10);
  });

  it("hard-knee static curve: above threshold matches T+(x-T)/R", () => {
    // x=-6, T=-24, R=2 → y=-24+(-6+24)/2=-15 → GR=-9
    const y = softKneeOutputDb(-6, -24, 0, 2);
    expect(y).toBeCloseTo(-15, 10);
    expect(staticGainReductionDb(-6, -24, 0, 2)).toBeCloseTo(-9, 10);
  });

  it("below-threshold constant → near unity (makeup 0, instant attack)", () => {
    const params: StudioFxCompressorParams = {
      thresholdDb: -6,
      ratio: 4,
      attackMs: 0,
      releaseMs: 50,
      makeupDb: 0,
    };
    const proc = createCompressorProcessorAtRate(
      compressorEffect(params),
      SR,
    );
    // -20 dB FS ≈ 0.1 linear — below -6 dB threshold
    const amp = dbToLinear(-20);
    let out = 0;
    for (let i = 0; i < 256; i++) {
      out = proc.process({ left: amp, right: amp }).left;
    }
    expect(out).toBeCloseTo(amp, 5);
  });

  it("above-threshold constant matches static GR × makeup", () => {
    const params: StudioFxCompressorParams = {
      thresholdDb: -24,
      ratio: 2,
      attackMs: 0,
      releaseMs: 50,
      makeupDb: 0,
    };
    const proc = createCompressorProcessorAtRate(
      compressorEffect(params),
      SR,
    );
    const amp = dbToLinear(-6); // above -24
    const expectedGr = staticGainReductionDb(-6, -24, 6, 2); // live knee=6
    const expected = amp * dbToLinear(expectedGr);
    let out = 0;
    for (let i = 0; i < 2048; i++) {
      out = proc.process({ left: amp, right: amp }).left;
    }
    // Soft knee + settle; tight absolute tolerance vs closed-form GR.
    expect(out).toBeCloseTo(expected, 4);
    expect(Math.abs(out)).toBeLessThan(amp);
  });

  it("makeup gain scales below-threshold output by 10^(makeup/20)", () => {
    const base: StudioFxCompressorParams = {
      thresholdDb: -6,
      ratio: 4,
      attackMs: 0,
      releaseMs: 50,
      makeupDb: 0,
    };
    const withMakeup = { ...base, makeupDb: 6 };
    const amp = dbToLinear(-20);
    const a = createCompressorProcessorAtRate(compressorEffect(base), SR);
    const b = createCompressorProcessorAtRate(
      compressorEffect(withMakeup),
      SR,
    );
    let outA = 0;
    let outB = 0;
    for (let i = 0; i < 256; i++) {
      outA = a.process({ left: amp, right: amp }).left;
      outB = b.process({ left: amp, right: amp }).left;
    }
    expect(outB / outA).toBeCloseTo(dbToLinear(6), 4);
  });

  it("slow attack delays full gain reduction vs instant attack", () => {
    const loud = dbToLinear(-3);
    const instant = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -24,
        ratio: 8,
        attackMs: 0,
        releaseMs: 200,
        makeupDb: 0,
      }),
      SR,
    );
    const slow = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -24,
        ratio: 8,
        attackMs: 200,
        releaseMs: 200,
        makeupDb: 0,
      }),
      SR,
    );
    // First sample after silence: slow attack should compress less.
    const oi = instant.process({ left: loud, right: loud }).left;
    const os = slow.process({ left: loud, right: loud }).left;
    expect(Math.abs(os)).toBeGreaterThan(Math.abs(oi));
  });

  it("release: GR eases after loud→quiet transition", () => {
    const proc = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -24,
        ratio: 8,
        attackMs: 0,
        releaseMs: 100,
        makeupDb: 0,
      }),
      SR,
    );
    const loud = dbToLinear(-3);
    const quiet = dbToLinear(-40);
    for (let i = 0; i < 512; i++) {
      proc.process({ left: loud, right: loud });
    }
    const rightAfter = proc.process({ left: quiet, right: quiet }).left;
    // ~10× release time → envelope ≈ settled for exponential coeff.
    for (let i = 0; i < Math.floor(SR * 1.0); i++) {
      proc.process({ left: quiet, right: quiet });
    }
    const later = proc.process({ left: quiet, right: quiet }).left;
    // Immediately after loud, residual GR still attenuates quiet; later nearer unity.
    expect(Math.abs(rightAfter)).toBeLessThan(Math.abs(quiet) * 0.99);
    expect(Math.abs(later)).toBeGreaterThan(Math.abs(rightAfter));
    expect(later).toBeCloseTo(quiet, 2);
  });

  it("stereo linked: louder channel drives GR on both", () => {
    const proc = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -24,
        ratio: 4,
        attackMs: 0,
        releaseMs: 50,
        makeupDb: 0,
      }),
      SR,
    );
    const loud = dbToLinear(-3);
    const quiet = dbToLinear(-30);
    let outL = 0;
    let outR = 0;
    for (let i = 0; i < 1024; i++) {
      const o = proc.process({ left: loud, right: quiet });
      outL = o.left;
      outR = o.right;
    }
    // Same GR: outR/quiet ≈ outL/loud
    expect(outL / loud).toBeCloseTo(outR / quiet, 4);
    expect(Math.abs(outL)).toBeLessThan(loud);
  });

  it("block continuity: split processing matches continuous", () => {
    const procA = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -18,
        ratio: 3,
        attackMs: 5,
        releaseMs: 80,
        makeupDb: 0,
      }),
      SR,
    );
    const procB = createCompressorProcessorAtRate(
      compressorEffect({
        thresholdDb: -18,
        ratio: 3,
        attackMs: 5,
        releaseMs: 80,
        makeupDb: 0,
      }),
      SR,
    );
    const seq = Array.from({ length: 400 }, (_, i) =>
      0.5 * Math.sin(i * 0.11),
    );
    const a: number[] = [];
    for (const x of seq) a.push(procA.process({ left: x, right: x }).left);
    const b: number[] = [];
    for (let i = 0; i < 200; i++) {
      b.push(procB.process({ left: seq[i]!, right: seq[i]! }).left);
    }
    for (let i = 200; i < 400; i++) {
      b.push(procB.process({ left: seq[i]!, right: seq[i]! }).left);
    }
    for (let i = 0; i < 400; i++) {
      expect(a[i]).toBeCloseTo(b[i]!, 10);
    }
  });

  it("determinism + NaN/Infinity sanitized", () => {
    const params = defaultStudioFxParams("compressor");
    const p1 = createCompressorProcessorAtRate(compressorEffect(params), SR);
    const p2 = createCompressorProcessorAtRate(compressorEffect(params), SR);
    for (let i = 0; i < 64; i++) {
      const x = (i % 9) / 9;
      expect(p1.process({ left: x, right: -x })).toEqual(
        p2.process({ left: x, right: -x }),
      );
    }
    const bad = p1.process({ left: Number.NaN, right: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(bad.left)).toBe(true);
    expect(Number.isFinite(bad.right)).toBe(true);
  });

  it("limiter: high amplitude reduced; ceiling scales output", () => {
    const base = createLimiterProcessorAtRate(
      limiterEffect({ thresholdDb: -1, ceilingDb: 0 }),
      SR,
    );
    const ceiling = createLimiterProcessorAtRate(
      limiterEffect({ thresholdDb: -1, ceilingDb: -6 }),
      SR,
    );
    const amp = 0.95; // ≈ -0.45 dBFS → above -1 dB threshold
    let out0 = 0;
    let outC = 0;
    for (let i = 0; i < 4096; i++) {
      out0 = base.process({ left: amp, right: amp }).left;
      outC = ceiling.process({ left: amp, right: amp }).left;
    }
    expect(Math.abs(out0)).toBeLessThan(amp);
    // ceilingDb=-6 → postGain ≈ 0.501 vs ceilingDb=0 → 1.0
    expect(outC / out0).toBeCloseTo(dbToLinear(-6), 3);
    expect(linearToDb(Math.abs(out0))).toBeLessThan(-0.5);
  });

  it("limiter is not claiming True Peak (sample-peak only)", () => {
    // Documented contract: no oversampling — inter-sample peaks can exceed.
    const proc = createLimiterProcessorAtRate(
      limiterEffect({ thresholdDb: -1, ceilingDb: -0.1 }),
      SR,
    );
    // Nyquist-ish alternating samples can have higher continuous peak than samples.
    let peak = 0;
    for (let i = 0; i < 512; i++) {
      const x = i % 2 === 0 ? 0.99 : -0.99;
      const o = proc.process({ left: x, right: x });
      peak = Math.max(peak, Math.abs(o.left));
    }
    expect(Number.isFinite(peak)).toBe(true);
    // Ceiling applied post-dynamics; still sample-domain only.
    expect(peak).toBeLessThanOrEqual(dbToLinear(0) + 1e-9);
  });

  it("bypass compressor is identity", () => {
    const bypassed: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [compressorEffect(defaultStudioFxParams("compressor"), false)],
    };
    const handle = buildStudioOfflineFxChain(bypassed, "track", SR)!;
    expect(handle.process({ left: 0.33, right: -0.2 })).toEqual({
      left: 0.33,
      right: -0.2,
    });
  });

  it("effect order: eq then compressor both applied in chain", () => {
    const eq = addStudioFxToChain(emptyStudioFxChain(), "eq", "track");
    const eqParams = defaultStudioFxParams("eq");
    eqParams.mid = { frequencyHz: 1000, gainDb: 0, q: 1 };
    const chain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [
        { ...eq.effects[0]!, params: eqParams },
        compressorEffect({
          thresholdDb: -24,
          ratio: 4,
          attackMs: 0,
          releaseMs: 50,
          makeupDb: 0,
        }),
      ],
    };
    const handle = buildStudioOfflineFxChain(chain, "track", SR)!;
    expect(handle.processors.map((p) => p.type)).toEqual([
      "eq",
      "compressor",
    ]);
    const amp = dbToLinear(-6);
    let out = 0;
    for (let i = 0; i < 1024; i++) {
      out = handle.process({ left: amp, right: amp }).left;
    }
    expect(Math.abs(out)).toBeLessThan(amp);
  });

  it("render integration: compressor reduces peak vs dry", async () => {
    const chain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [
        compressorEffect({
          thresholdDb: -24,
          ratio: 8,
          attackMs: 0,
          releaseMs: 50,
          makeupDb: 0,
        }),
      ],
    };
    const pcm = sinePcm(Math.ceil(SR * 0.3), 440, 0.8);
    const clips = [
      clip({
        id: "c1",
        trackId: "t1",
        sourceKind: "TAKE",
        sourceTakeId: "take-1",
        timelineStartMs: 0,
        durationMs: 300,
      }),
    ];
    const dry = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 300,
        tracks: [track({ id: "t1" })],
        clips,
      }),
      resolvePcm: async () => pcm,
    });
    const wet = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 300,
        tracks: [track({ id: "t1", effectsChain: chain })],
        clips,
      }),
      resolvePcm: async () => pcm,
    });
    expect(wet.peakAbs).toBeLessThan(dry.peakAbs);
  });

  it("render integration: master limiter + track EQ still dry-safe for empty", async () => {
    const lim: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [limiterEffect({ thresholdDb: -1, ceilingDb: -0.1 })],
    };
    const pcm = sinePcm(Math.ceil(SR * 0.2), 880, 0.9);
    const result = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 200,
        masterFxChain: lim,
        tracks: [track({ id: "t1", effectsChain: emptyStudioFxChain() })],
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
      }),
      resolvePcm: async () => pcm,
    });
    expect(result.peakAbs).toBeLessThan(0.9);
    expect(Number.isFinite(result.rms)).toBe(true);
  });
});

describe("SFM-3D delay + reverb", () => {
  const ID_D = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const ID_R = "ffffffff-ffff-4fff-8fff-ffffffffffff";

  function delayEffect(
    params: { mix: number; timeMs: number; feedback: number },
    enabled = true,
  ) {
    return {
      id: ID_D,
      type: "delay" as const,
      enabled,
      params,
    };
  }

  function reverbEffect(
    params: { mix: number; decaySeconds: number },
    enabled = true,
  ) {
    return {
      id: ID_R,
      type: "reverb" as const,
      enabled,
      params,
    };
  }

  it("delay: impulse appears at expected delay sample", () => {
    const timeMs = 100;
    const delaySamples = delaySamplesForTimeMs(SR, timeMs);
    const proc = createDelayProcessorAtRate(
      delayEffect({ mix: 1, timeMs, feedback: 0 }),
      SR,
    );
    const out: number[] = [];
    for (let i = 0; i < delaySamples + 4; i++) {
      const x = i === 0 ? 1 : 0;
      out.push(proc.process({ left: x, right: 0 }).left);
    }
    expect(out[0]).toBeCloseTo(0, 10); // mix=1 → no dry
    expect(out[delaySamples]).toBeCloseTo(1, 5);
    expect(Math.abs(out[delaySamples - 1]!)).toBeLessThan(1e-6);
  });

  it("delay: wet/dry mix", () => {
    const timeMs = 50;
    const d = delaySamplesForTimeMs(SR, timeMs);
    const proc = createDelayProcessorAtRate(
      delayEffect({ mix: 0.5, timeMs, feedback: 0 }),
      SR,
    );
    // At t=0 impulse: dry contribution 0.5
    expect(proc.process({ left: 1, right: 0 }).left).toBeCloseTo(0.5, 5);
    for (let i = 1; i < d; i++) {
      proc.process({ left: 0, right: 0 });
    }
    // At delay: wet 0.5 * 1, dry 0
    expect(proc.process({ left: 0, right: 0 }).left).toBeCloseTo(0.5, 5);
  });

  it("delay: feedback decays successive repeats", () => {
    const timeMs = 20;
    const d = delaySamplesForTimeMs(SR, timeMs);
    const fb = 0.5;
    const proc = createDelayProcessorAtRate(
      delayEffect({ mix: 1, timeMs, feedback: fb }),
      SR,
    );
    const peaks: number[] = [];
    for (let i = 0; i < d * 4 + 2; i++) {
      const x = i === 0 ? 1 : 0;
      const y = proc.process({ left: x, right: 0 }).left;
      if (i > 0 && i % d === 0) peaks.push(y);
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    expect(peaks[0]).toBeCloseTo(1, 4);
    expect(peaks[1]).toBeCloseTo(fb, 3);
    expect(peaks[2]).toBeCloseTo(fb * fb, 3);
  });

  it("delay: stereo channels independent", () => {
    const proc = createDelayProcessorAtRate(
      delayEffect({ mix: 1, timeMs: 10, feedback: 0 }),
      SR,
    );
    const d = delaySamplesForTimeMs(SR, 10);
    proc.process({ left: 1, right: 0 });
    for (let i = 1; i < d; i++) proc.process({ left: 0, right: 0 });
    const o = proc.process({ left: 0, right: 0 });
    expect(o.left).toBeCloseTo(1, 5);
    expect(Math.abs(o.right)).toBeLessThan(1e-9);
  });

  it("delay: bypass is identity", () => {
    const chain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [delayEffect({ mix: 1, timeMs: 250, feedback: 0.5 }, false)],
    };
    const h = buildStudioOfflineFxChain(chain, "track", SR)!;
    expect(h.process({ left: 0.4, right: -0.2 })).toEqual({
      left: 0.4,
      right: -0.2,
    });
  });

  it("delay: buffer bytes bounded by 2s stereo", () => {
    const bytes = delayBufferBytes(SR, 2000);
    expect(bytes).toBeLessThanOrEqual((SR * 2 + 1) * 2 * 4);
    expect(bytes).toBeGreaterThan(SR); // non-trivial
  });

  it("delay: NaN sanitized", () => {
    const proc = createDelayProcessorAtRate(
      delayEffect({ mix: 1, timeMs: 5, feedback: 0 }),
      SR,
    );
    const o = proc.process({
      left: Number.NaN,
      right: Number.POSITIVE_INFINITY,
    });
    expect(Number.isFinite(o.left)).toBe(true);
    expect(Number.isFinite(o.right)).toBe(true);
  });

  it("shared impulse: seeded fill is deterministic", () => {
    const n = 128;
    const aL = new Float32Array(n);
    const aR = new Float32Array(n);
    const bL = new Float32Array(n);
    const bR = new Float32Array(n);
    const seed = studioOfflineImpulseSeed(SR, 0.2);
    fillStudioSyntheticImpulse(
      aL,
      aR,
      SR,
      0.2,
      createSeededUnitRandom(seed),
    );
    fillStudioSyntheticImpulse(
      bL,
      bR,
      SR,
      0.2,
      createSeededUnitRandom(seed),
    );
    expect(aL).toEqual(bL);
    expect(aR).toEqual(bR);
  });

  it("reverb: wet energy after block latency; dry immediate when mix<1", () => {
    const proc = createReverbProcessorAtRate(
      reverbEffect({ mix: 0.5, decaySeconds: 0.15 }),
      SR,
    );
    // Impulse: dry half immediate
    expect(proc.process({ left: 1, right: 1 }).left).toBeCloseTo(0.5, 5);
    let wetPeak = 0;
    for (let i = 0; i < STUDIO_OFFLINE_REVERB_BLOCK_SIZE * 4; i++) {
      const y = proc.process({ left: 0, right: 0 }).left;
      wetPeak = Math.max(wetPeak, Math.abs(y));
    }
    expect(wetPeak).toBeGreaterThan(1e-4);
  });

  it("reverb: mix=1 has convolver latency then energy", () => {
    const proc = createReverbProcessorAtRate(
      reverbEffect({ mix: 1, decaySeconds: 0.2 }),
      SR,
    );
    const early: number[] = [];
    for (let i = 0; i < STUDIO_OFFLINE_REVERB_BLOCK_SIZE - 1; i++) {
      early.push(
        proc.process({ left: i === 0 ? 1 : 0, right: i === 0 ? 1 : 0 }).left,
      );
    }
    // Before first block completes, wet≈0
    expect(Math.max(...early.map(Math.abs))).toBeLessThan(1e-9);
    let peak = 0;
    for (let i = 0; i < STUDIO_OFFLINE_REVERB_BLOCK_SIZE * 8; i++) {
      peak = Math.max(
        peak,
        Math.abs(proc.process({ left: 0, right: 0 }).left),
      );
    }
    expect(peak).toBeGreaterThan(1e-4);
  });

  it("reverb: energy decays over time after impulse", () => {
    const earlyProc = createReverbProcessorAtRate(
      reverbEffect({ mix: 1, decaySeconds: 0.3 }),
      SR,
    );
    earlyProc.process({ left: 1, right: 1 });
    let early = 0;
    for (let i = 0; i < STUDIO_OFFLINE_REVERB_BLOCK_SIZE * 2; i++) {
      earlyProc.process({ left: 0, right: 0 });
    }
    for (let i = 0; i < 2048; i++) {
      const y = earlyProc.process({ left: 0, right: 0 }).left;
      early += y * y;
    }
    early = Math.sqrt(early / 2048);

    const lateProc = createReverbProcessorAtRate(
      reverbEffect({ mix: 1, decaySeconds: 0.3 }),
      SR,
    );
    lateProc.process({ left: 1, right: 1 });
    for (let i = 0; i < Math.floor(SR * 0.25); i++) {
      lateProc.process({ left: 0, right: 0 });
    }
    let late = 0;
    for (let i = 0; i < 2048; i++) {
      const y = lateProc.process({ left: 0, right: 0 }).left;
      late += y * y;
    }
    late = Math.sqrt(late / 2048);
    expect(early).toBeGreaterThan(late);
  });

  it("reverb: stereo; bypass identity; IR memory estimate", () => {
    const proc = createReverbProcessorAtRate(
      reverbEffect({ mix: 1, decaySeconds: 0.12 }),
      SR,
    );
    proc.process({ left: 1, right: 0 });
    let maxR = 0;
    for (let i = 0; i < STUDIO_OFFLINE_REVERB_BLOCK_SIZE * 4; i++) {
      maxR = Math.max(
        maxR,
        Math.abs(proc.process({ left: 0, right: 0 }).right),
      );
    }
    // Independent IR noise → right may be non-zero from its own IR only if right input; left-only input → right wet≈0
    expect(maxR).toBeLessThan(1e-6);

    const bypass: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [reverbEffect({ mix: 1, decaySeconds: 1.2 }, false)],
    };
    const h = buildStudioOfflineFxChain(bypass, "master", SR)!;
    expect(h.process({ left: 0.2, right: 0.3 })).toEqual({
      left: 0.2,
      right: 0.3,
    });

    const irBytes = studioImpulsePcmBytes(SR, 6);
    expect(irBytes).toBe(Math.floor(SR * 6) * 2 * 4);
    expect(irBytes).toBeLessThan(3 * 1024 * 1024);
  });

  it("reverb: determinism for identical params", () => {
    const p1 = createReverbProcessorAtRate(
      reverbEffect({ mix: 0.7, decaySeconds: 0.15 }),
      SR,
    );
    const p2 = createReverbProcessorAtRate(
      reverbEffect({ mix: 0.7, decaySeconds: 0.15 }),
      SR,
    );
    for (let i = 0; i < 3000; i++) {
      const x = i === 0 ? 0.8 : 0;
      expect(p1.process({ left: x, right: x })).toEqual(
        p2.process({ left: x, right: x }),
      );
    }
  });

  it("integration: track delay + master reverb + EQ order", async () => {
    const eq = addStudioFxToChain(emptyStudioFxChain(), "eq", "track");
    const trackChain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [
        { ...eq.effects[0]!, params: defaultStudioFxParams("eq") },
        delayEffect({ mix: 0.3, timeMs: 40, feedback: 0.2 }),
      ],
    };
    const masterChain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [reverbEffect({ mix: 0.2, decaySeconds: 0.15 })],
    };
    const pcm = sinePcm(Math.ceil(SR * 0.25), 660, 0.5);
    const result = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 250,
        masterFxChain: masterChain,
        tracks: [track({ id: "t1", effectsChain: trackChain })],
        clips: [
          clip({
            id: "c1",
            trackId: "t1",
            sourceKind: "TAKE",
            sourceTakeId: "take-1",
            timelineStartMs: 0,
            durationMs: 250,
          }),
        ],
      }),
      resolvePcm: async () => pcm,
    });
    expect(result.peakAbs).toBeGreaterThan(0);
    expect(Number.isFinite(result.rms)).toBe(true);
  });

  it("integration: FX state counts toward MEMORY_CAP", async () => {
    const chain: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [reverbEffect({ mix: 0.5, decaySeconds: 0.5 })],
    };
    await expect(
      renderStudioDocumentOffline({
        document: doc({
          timelineLengthMs: 500,
          tracks: [track({ id: "t1", effectsChain: chain })],
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
        }),
        resolvePcm: async () => sinePcm(1000, 440),
        // Tiny total budget: IR+state for 0.5s reverb exceeds this with output.
        maxTotalPcmBytes: 1024,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_MEMORY_CAP" });
  });

  it("regression: dry + eq + compressor still work", async () => {
    const dry = await renderStudioDocumentOffline({
      document: doc({
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
      }),
      resolvePcm: async () => sinePcm(Math.ceil(SR * 0.1), 440, 0.4),
    });
    expect(dry.peakAbs).toBeGreaterThan(0.2);

    const eqComp: StudioFxChainV1 = {
      schemaVersion: 1,
      effects: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          type: "eq",
          enabled: true,
          params: defaultStudioFxParams("eq"),
        },
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          type: "compressor",
          enabled: true,
          params: {
            thresholdDb: -12,
            ratio: 2,
            attackMs: 0,
            releaseMs: 50,
            makeupDb: 0,
          },
        },
      ],
    };
    const wet = await renderStudioDocumentOffline({
      document: doc({
        timelineLengthMs: 100,
        tracks: [track({ id: "t1", effectsChain: eqComp })],
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
      }),
      resolvePcm: async () => sinePcm(Math.ceil(SR * 0.1), 440, 0.4),
    });
    expect(Number.isFinite(wet.peakAbs)).toBe(true);
  });
});
