/**
 * Stage I.13b — Plane A FX parity:
 * OfflineAudioContext @ 44100 (live FX graph builders) vs renderStudioDocumentOffline.
 *
 * Functional / numerical comparison — NOT sample-identical WAV.
 * Does not load Supabase, Next, workers, or .env.local.
 */

import { afterAll, describe, expect, it } from "vitest";

import {
  planStudioExportDuration,
} from "@/lib/studio/studio-export-fx-post-roll";
import {
  baseDocument,
  compressorChain,
  delayChain,
  eqBoostMidChain,
  eqCutMidChain,
  impulsePcm,
  limiterChain,
  PARITY_SR,
  PARITY_TAKE_ID,
  PARITY_TRACK_ID,
  reverbChain,
  sinePcm,
  takeResolver,
} from "@/lib/studio/studio-fx-parity-fixtures";
import {
  bandEnergyNear,
  bestCorrelateMono,
  dbRatio,
  measureSignal,
  windowEnergy,
} from "@/lib/studio/studio-fx-parity-metrics";
import {
  closeOacHost,
  renderViaOfflineAudioContext,
} from "@/lib/studio/studio-fx-parity-oac-host";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
} from "@/lib/studio/studio-offline-render";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

const TIMELINE_MS = 1000;

async function renderBoth(
  pcm: ReturnType<typeof sinePcm>,
  document: ReturnType<typeof baseDocument>,
  exportDurationMs?: number,
) {
  const exportMs = exportDurationMs ?? document.timelineLengthMs;
  const offline = await renderStudioDocumentOffline({
    document,
    resolvePcm: takeResolver(pcm),
    exportDurationMs: exportMs,
  });
  const oac = await renderViaOfflineAudioContext({
    sampleRate: PARITY_SR,
    sourcePcm: pcm.interleaved,
    sourceFrames: pcm.frames,
    document,
    exportDurationMs: exportMs,
  });
  return { offline, oac, exportMs };
}

afterAll(async () => {
  await closeOacHost();
});

describe("Stage I.13b plane A — OfflineAudioContext@44100 vs offline PCM", () => {
  it("preflight: sample rate contract is 44100", () => {
    expect(STUDIO_OFFLINE_RENDER_SAMPLE_RATE).toBe(44100);
    expect(PARITY_SR).toBe(44100);
  });

  it("1 dry baseline — high correlation, no NaN", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 440, amp: 0.25 });
    const document = baseDocument({ timelineLengthMs: TIMELINE_MS });
    const { offline, oac } = await renderBoth(pcm, document);

    const mOff = measureSignal(offline.interleaved, offline.sampleRate);
    const mOac = measureSignal(oac.interleaved, oac.sampleRate);

    expect(mOff.nanInfCount).toBe(0);
    expect(mOac.nanInfCount).toBe(0);
    expect(mOff.sampleRate).toBe(44100);
    expect(mOac.sampleRate).toBe(44100);
    expect(Math.abs(mOff.durationMs - TIMELINE_MS)).toBeLessThan(1);
    expect(Math.abs(mOac.durationMs - TIMELINE_MS)).toBeLessThan(1);

    // Dry + pan=0: StereoPanner ≈ linear pan; float path differences only.
    // Tolerance: corr ≥ 0.99 justified by identical source + no FX + center pan.
    const { correlation, lag } = bestCorrelateMono(
      offline.interleaved,
      oac.interleaved,
      8,
    );
    expect(Math.abs(lag)).toBeLessThanOrEqual(2);
    expect(correlation).toBeGreaterThanOrEqual(0.99);

    const rmsDb = Math.abs(dbRatio(mOff.rms, mOac.rms));
    // ≤0.5 dB: numerical / panner law residual at pan=0.
    expect(rmsDb).toBeLessThanOrEqual(0.5);
  }, 60_000);

  it("2 EQ — mid boost raises band energy vs cut on both paths", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 1000, amp: 0.2 });
    const boostDoc = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: eqBoostMidChain(),
        },
      ],
    });
    const cutDoc = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: eqCutMidChain(),
        },
      ],
    });

    const boost = await renderBoth(pcm, boostDoc);
    const cut = await renderBoth(pcm, cutDoc);

    for (const pair of [boost, cut]) {
      expect(countNan(pair.offline.interleaved)).toBe(0);
      expect(countNan(pair.oac.interleaved)).toBe(0);
    }

    const eBoostOff = bandEnergyNear(boost.offline.interleaved, PARITY_SR, 1000, 80);
    const eCutOff = bandEnergyNear(cut.offline.interleaved, PARITY_SR, 1000, 80);
    const eBoostOac = bandEnergyNear(boost.oac.interleaved, PARITY_SR, 1000, 80);
    const eCutOac = bandEnergyNear(cut.oac.interleaved, PARITY_SR, 1000, 80);

    // Directional contract: boost > cut on each engine independently.
    expect(eBoostOff).toBeGreaterThan(eCutOff * 2);
    expect(eBoostOac).toBeGreaterThan(eCutOac * 2);
  }, 90_000);

  it("3 compressor — reduces peak vs dry on loud sustained signal (both paths)", async () => {
    // Loud sine above threshold (−24 dB ≈ 0.063); amp 0.8 engages GR.
    // Crest is not a reliable metric (GR can raise crest while lowering peak).
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 220, amp: 0.8 });

    const dryDoc = baseDocument({ timelineLengthMs: TIMELINE_MS });
    const compDoc = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: compressorChain(),
        },
      ],
    });

    const dry = await renderBoth(pcm, dryDoc);
    const comp = await renderBoth(pcm, compDoc);

    const peakOffDry = measureSignal(dry.offline.interleaved, PARITY_SR).peakAbs;
    const peakOffComp = measureSignal(comp.offline.interleaved, PARITY_SR).peakAbs;
    const peakOacDry = measureSignal(dry.oac.interleaved, PARITY_SR).peakAbs;
    const peakOacComp = measureSignal(comp.oac.interleaved, PARITY_SR).peakAbs;

    expect(countNan(comp.offline.interleaved)).toBe(0);
    expect(countNan(comp.oac.interleaved)).toBe(0);
    // Directional GR contract per engine (Node approx ≠ browser DynamicsCompressor).
    expect(peakOffComp).toBeLessThan(peakOffDry);
    expect(peakOacComp).toBeLessThan(peakOacDry);
  }, 90_000);

  it("4 limiter — sample-peak reduction vs dry (not true-peak / brickwall)", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 200, amp: 0.9 });
    const dryDoc = baseDocument({ timelineLengthMs: TIMELINE_MS });
    const limDoc = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: limiterChain(),
        },
      ],
    });
    const dry = await renderBoth(pcm, dryDoc);
    const lim = await renderBoth(pcm, limDoc);
    const mDryOff = measureSignal(dry.offline.interleaved, PARITY_SR);
    const mLimOff = measureSignal(lim.offline.interleaved, PARITY_SR);
    const mDryOac = measureSignal(dry.oac.interleaved, PARITY_SR);
    const mLimOac = measureSignal(lim.oac.interleaved, PARITY_SR);
    expect(mLimOff.nanInfCount).toBe(0);
    expect(mLimOac.nanInfCount).toBe(0);

    // Implementation is DynamicsCompressor-style + ceiling Gain — not true-peak.
    // Require peak reduction vs dry on each engine (directional contract).
    expect(mLimOff.peakAbs).toBeLessThan(mDryOff.peakAbs);
    expect(mLimOac.peakAbs).toBeLessThan(mDryOac.peakAbs);
  }, 90_000);

  it("5 delay — echo onset near 100ms; wet energy after delay", async () => {
    const pcm = impulsePcm(TIMELINE_MS, 0.8);
    const document = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: delayChain(),
        },
      ],
    });
    const plan = planStudioExportDuration(document);
    const { offline, oac } = await renderBoth(
      pcm,
      document,
      plan.exportDurationMs,
    );

    const delayFrames = Math.round((100 / 1000) * PARITY_SR);
    // Tolerance ±2 ms ≈ 88 samples — clock/quantization of DelayNode vs circular line.
    const tol = Math.round((2 / 1000) * PARITY_SR);

    for (const interleaved of [offline.interleaved, oac.interleaved]) {
      expect(countNan(interleaved)).toBe(0);
      // Energy in echo window should exceed pre-echo silence after impulse.
      const pre = windowEnergy(interleaved, 10, delayFrames - tol);
      const echo = windowEnergy(
        interleaved,
        delayFrames - tol,
        delayFrames + tol + 200,
      );
      expect(echo).toBeGreaterThan(pre);
      // First strong onset after dry impulse: look past frame 0 region.
      const onset = firstOnsetFrameAfter(interleaved, 20, 0.02);
      expect(onset).toBeGreaterThan(delayFrames - tol);
      expect(onset).toBeLessThan(delayFrames + tol + 50);
    }
  }, 90_000);

  it("6 reverb — wet energy after partitioned latency; not sample-identical", async () => {
    const pcm = impulsePcm(TIMELINE_MS, 0.85);
    const document = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: reverbChain(),
        },
      ],
    });
    const plan = planStudioExportDuration(document);
    expect(plan.postRollMs).toBeGreaterThan(0);
    expect(plan.postRollMs).toBeLessThanOrEqual(3000);

    const { offline, oac } = await renderBoth(
      pcm,
      document,
      plan.exportDurationMs,
    );

    // Offline partitioned convolve latency = 512 samples.
    const lat = 512;
    const wetOff = windowEnergy(offline.interleaved, lat, lat + 4000);
    const earlyOff = windowEnergy(offline.interleaved, 1, 40);
    expect(wetOff).toBeGreaterThan(0);
    // Mix 0.7: dry present at 0; wet builds after latency.
    expect(wetOff).toBeGreaterThan(earlyOff * 0.1);

    const wetOac = windowEnergy(oac.interleaved, 0, 8000);
    expect(wetOac).toBeGreaterThan(0);
    expect(countNan(offline.interleaved)).toBe(0);
    expect(countNan(oac.interleaved)).toBe(0);

    // IR RNG differs (seeded vs Math.random) — correlation must NOT be required.
    const { correlation } = bestCorrelateMono(
      offline.interleaved,
      oac.interleaved,
      512,
    );
    // Document measurement only — do not fail on low correlation.
    expect(typeof correlation).toBe("number");
  }, 90_000);

  it("7 track + master FX order — both paths produce finite audio", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 660, amp: 0.2 });
    const document = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: eqBoostMidChain(),
        },
      ],
      masterFxChain: (() => {
        // Master limiter must be last among enabled — use limiter only.
        return limiterChain();
      })(),
    });
    // limiterChain uses role track factory; re-parse as master-safe chain:
    document.masterFxChain = {
      schemaVersion: 1,
      effects: [
        {
          id: "11111111-1111-4111-8111-111111111103",
          type: "limiter",
          enabled: true,
          params: { thresholdDb: -6, ceilingDb: -3 },
        },
      ],
    };

    const { offline, oac } = await renderBoth(pcm, document);
    expect(countNan(offline.interleaved)).toBe(0);
    expect(countNan(oac.interleaved)).toBe(0);
    expect(measureSignal(offline.interleaved, PARITY_SR).rms).toBeGreaterThan(0);
    expect(measureSignal(oac.interleaved, PARITY_SR).rms).toBeGreaterThan(0);
  }, 90_000);

  it("8 mute / solo / gain / pan / fade contracts", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 440, amp: 0.3 });

    // Mute: offline bake fails-closed EMPTY_SESSION (no audible voices).
    // OAC path still produces silence — that is the live-graph mute contract.
    const mutedDoc = baseDocument({
      timelineLengthMs: TIMELINE_MS,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: true,
          solo: false,
          effectsChain: emptyStudioFxChain(),
        },
      ],
    });
    await expect(
      renderStudioDocumentOffline({
        document: mutedDoc,
        resolvePcm: takeResolver(pcm),
        exportDurationMs: TIMELINE_MS,
      }),
    ).rejects.toMatchObject({ code: "STUDIO_RENDER_EMPTY_SESSION" });
    const mutedOac = await renderViaOfflineAudioContext({
      sampleRate: PARITY_SR,
      sourcePcm: pcm.interleaved,
      sourceFrames: pcm.frames,
      document: mutedDoc,
      exportDurationMs: TIMELINE_MS,
    });
    expect(measureSignal(mutedOac.interleaved, PARITY_SR).rms).toBeLessThan(
      1e-6,
    );

    // Solo other track silent: add second muted-by-solo track with same clip? 
    // Simpler: track without solo while another has solo — our fixture has 1 track.
    // Solo=true with single track remains audible.
    const soloed = await renderBoth(
      pcm,
      baseDocument({
        timelineLengthMs: TIMELINE_MS,
        tracks: [
          {
            id: PARITY_TRACK_ID,
            gainDb: 0,
            pan: 0,
            muted: false,
            solo: true,
            effectsChain: emptyStudioFxChain(),
          },
        ],
      }),
    );
    expect(measureSignal(soloed.offline.interleaved, PARITY_SR).rms).toBeGreaterThan(
      0.01,
    );

    // Gain -6 dB lowers RMS vs 0 dB (both engines, independently).
    const g0 = await renderBoth(pcm, baseDocument({ timelineLengthMs: TIMELINE_MS }));
    const gDown = await renderBoth(
      pcm,
      baseDocument({
        timelineLengthMs: TIMELINE_MS,
        tracks: [
          {
            id: PARITY_TRACK_ID,
            gainDb: -6,
            pan: 0,
            muted: false,
            solo: false,
            effectsChain: emptyStudioFxChain(),
          },
        ],
      }),
    );
    expect(measureSignal(gDown.offline.interleaved, PARITY_SR).rms).toBeLessThan(
      measureSignal(g0.offline.interleaved, PARITY_SR).rms,
    );
    expect(measureSignal(gDown.oac.interleaved, PARITY_SR).rms).toBeLessThan(
      measureSignal(g0.oac.interleaved, PARITY_SR).rms,
    );

    // Pan hard left: L energy > R energy (direction). Laws differ (StereoPanner vs linear).
    const panL = await renderBoth(
      pcm,
      baseDocument({
        timelineLengthMs: TIMELINE_MS,
        tracks: [
          {
            id: PARITY_TRACK_ID,
            gainDb: 0,
            pan: -1,
            muted: false,
            solo: false,
            effectsChain: emptyStudioFxChain(),
          },
        ],
      }),
    );
    const mOff = measureSignal(panL.offline.interleaved, PARITY_SR);
    const mOac = measureSignal(panL.oac.interleaved, PARITY_SR);
    expect(mOff.energyL).toBeGreaterThan(mOff.energyR);
    expect(mOac.energyL).toBeGreaterThan(mOac.energyR);

    // Fade-in: early window quieter than late window (offline exact; OAC stepped).
    const faded = await renderBoth(
      pcm,
      baseDocument({
        timelineLengthMs: TIMELINE_MS,
        clips: [
          {
            id: "parity-clip-1",
            trackId: PARITY_TRACK_ID,
            sourceKind: "TAKE",
            sourceTakeId: PARITY_TAKE_ID,
            sourceBeatId: null,
            sourceOffsetMs: 0,
            timelineStartMs: 0,
            durationMs: TIMELINE_MS,
            gainDb: 0,
            muted: false,
            fadeInMs: 400,
            fadeOutMs: 0,
          },
        ],
      }),
    );
    const early = windowEnergy(faded.offline.interleaved, 0, 2000);
    const late = windowEnergy(faded.offline.interleaved, 20_000, 30_000);
    expect(late).toBeGreaterThan(early);
    const earlyO = windowEnergy(faded.oac.interleaved, 0, 2000);
    const lateO = windowEnergy(faded.oac.interleaved, 20_000, 30_000);
    expect(lateO).toBeGreaterThan(earlyO);
  }, 120_000);

  it("9 post-roll matches planStudioExportDuration (≤3000 ms)", async () => {
    // Feedback delay so echoes continue into the post-roll window after timeline.
    const pcm = impulsePcm(400, 0.85);
    const delayFb = delayChain();
    const fx = delayFb.effects[0]!;
    if (fx.type === "delay") {
      fx.params.feedback = 0.7;
      fx.params.timeMs = 100;
      fx.params.mix = 0.5;
    }
    const document = baseDocument({
      timelineLengthMs: 400,
      tracks: [
        {
          id: PARITY_TRACK_ID,
          gainDb: 0,
          pan: 0,
          muted: false,
          solo: false,
          effectsChain: delayFb,
        },
      ],
      clips: [
        {
          id: "parity-clip-1",
          trackId: PARITY_TRACK_ID,
          sourceKind: "TAKE",
          sourceTakeId: PARITY_TAKE_ID,
          sourceBeatId: null,
          sourceOffsetMs: 0,
          timelineStartMs: 0,
          durationMs: 400,
          gainDb: 0,
          muted: false,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
      ],
    });
    const plan = planStudioExportDuration(document);
    expect(plan.needsPostRoll).toBe(true);
    expect(plan.postRollMs).toBe(3000); // delay mix>0 → full MAX
    expect(plan.postRollMs).toBeLessThanOrEqual(3000);
    expect(plan.exportDurationMs).toBe(3400);

    const { offline, oac } = await renderBoth(
      pcm,
      document,
      plan.exportDurationMs,
    );
    expect(Math.round(offline.durationMs)).toBe(3400);
    expect(Math.round((oac.frames / PARITY_SR) * 1000)).toBe(3400);
    // Tail after timeline (source stopped) still has feedback echoes.
    const tailStart = Math.floor((400 / 1000) * PARITY_SR);
    expect(
      windowEnergy(offline.interleaved, tailStart, tailStart + PARITY_SR),
    ).toBeGreaterThan(0);
    expect(
      windowEnergy(oac.interleaved, tailStart, tailStart + PARITY_SR),
    ).toBeGreaterThan(0);
  }, 90_000);
});

function countNan(interleaved: Float32Array): number {
  return measureSignal(interleaved, PARITY_SR).nanInfCount;
}

function firstOnsetFrameAfter(
  interleaved: Float32Array,
  startFrame: number,
  threshold: number,
): number {
  const frames = Math.floor(interleaved.length / 2);
  for (let i = startFrame; i < frames; i++) {
    const m = Math.abs(
      0.5 * ((interleaved[i * 2] ?? 0) + (interleaved[i * 2 + 1] ?? 0)),
    );
    if (m >= threshold) return i;
  }
  return -1;
}
