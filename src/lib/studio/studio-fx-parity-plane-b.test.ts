/**
 * Stage I.13D — Plane B: real StudioAudioEngine (MediaElement + AudioContext)
 * vs renderStudioDocumentOffline. Raw AudioWorklet tap. Local only.
 */

import { afterAll, describe, expect, it } from "vitest";

import { planStudioExportDuration } from "@/lib/studio/studio-export-fx-post-roll";
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
  closePlaneBHost,
  renderViaStudioAudioEngine,
} from "@/lib/studio/studio-fx-parity-plane-b-host";
import { resampleInterleavedLinear } from "@/lib/studio/studio-fx-parity-resample";
import {
  renderStudioDocumentOffline,
  STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
} from "@/lib/studio/studio-offline-render";
import { emptyStudioFxChain } from "@/lib/studio/studio-fx-chain";

const TIMELINE_MS = 1000;

function truncateToMs(
  interleaved: Float32Array,
  sampleRate: number,
  durationMs: number,
): Float32Array {
  const frames = Math.min(
    Math.floor(interleaved.length / 2),
    Math.max(1, Math.round((durationMs / 1000) * sampleRate)),
  );
  return interleaved.subarray(0, frames * 2);
}

async function renderOfflineAndLive(
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
  const live = await renderViaStudioAudioEngine({
    sourcePcm: pcm.interleaved,
    sourceFrames: pcm.frames,
    sourceSampleRate: PARITY_SR,
    document,
    captureDurationMs: exportMs,
    settleMs: 350,
  });
  const liveTrim = truncateToMs(live.interleaved, live.sampleRate, exportMs + 50);
  const liveAt441 = resampleInterleavedLinear(
    liveTrim,
    live.sampleRate,
    STUDIO_OFFLINE_RENDER_SAMPLE_RATE,
  );
  return { offline, live, liveTrim, liveAt441, exportMs };
}

afterAll(async () => {
  await closePlaneBHost();
});

describe("Stage I.13D plane B — StudioAudioEngine live vs offline", () => {
  it("preflight contracts", () => {
    expect(STUDIO_OFFLINE_RENDER_SAMPLE_RATE).toBe(44100);
  });

  it("1 dry baseline — capture live + compare (resampled)", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 440, amp: 0.25 });
    const document = baseDocument({ timelineLengthMs: TIMELINE_MS });
    const { offline, live, liveTrim, liveAt441 } = await renderOfflineAndLive(
      pcm,
      document,
    );

    expect(live.sampleRate).toBeGreaterThan(0);
    // Chromium headless commonly reports 48000 — record, do not force.
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 1,
        liveSampleRate: live.sampleRate,
        captureMs: live.captureMs,
        liveFrames: live.frames,
        errors: live.errors,
      }),
    );

    const mOff = measureSignal(offline.interleaved, PARITY_SR);
    const mLiveNative = measureSignal(liveTrim, live.sampleRate);
    const mLive44 = measureSignal(liveAt441, PARITY_SR);

    expect(mOff.nanInfCount).toBe(0);
    expect(mLive44.nanInfCount).toBe(0);
    expect(mLiveNative.rms).toBeGreaterThan(1e-5);
    expect(mOff.rms).toBeGreaterThan(1e-5);

    const { correlation, lag } = bestCorrelateMono(
      offline.interleaved,
      liveAt441,
      Math.round(0.05 * PARITY_SR), // ±50 ms search (MediaElement start skew)
    );
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        case: 1,
        correlation,
        lagSamples: lag,
        lagMs: (lag / PARITY_SR) * 1000,
        rmsDb: dbRatio(mOff.rms, mLive44.rms),
      }),
    );

    // Functional: both audible, finite. Correlation threshold is Owner decision
    // under MediaElement + possible 48k linear resample — require corr > 0.5 as
    // weak smoke that paths are related; stronger bar left as OWNER DECISION.
    expect(correlation).toBeGreaterThan(0.5);
  }, 120_000);

  it("2 EQ — mid boost raises band energy vs cut (live + offline)", async () => {
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
    const boost = await renderOfflineAndLive(pcm, boostDoc);
    const cut = await renderOfflineAndLive(pcm, cutDoc);

    const eBoostOff = bandEnergyNear(boost.offline.interleaved, PARITY_SR, 1000, 80);
    const eCutOff = bandEnergyNear(cut.offline.interleaved, PARITY_SR, 1000, 80);
    const eBoostLive = bandEnergyNear(boost.liveAt441, PARITY_SR, 1000, 80);
    const eCutLive = bandEnergyNear(cut.liveAt441, PARITY_SR, 1000, 80);

    expect(eBoostOff).toBeGreaterThan(eCutOff * 2);
    expect(eBoostLive).toBeGreaterThan(eCutLive * 2);
  }, 180_000);

  it("3 compressor — peak reduction vs dry on both engines", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 220, amp: 0.8 });
    const dry = await renderOfflineAndLive(
      pcm,
      baseDocument({ timelineLengthMs: TIMELINE_MS }),
    );
    const comp = await renderOfflineAndLive(
      pcm,
      baseDocument({
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
      }),
    );
    expect(
      measureSignal(comp.offline.interleaved, PARITY_SR).peakAbs,
    ).toBeLessThan(measureSignal(dry.offline.interleaved, PARITY_SR).peakAbs);
    expect(measureSignal(comp.liveAt441, PARITY_SR).peakAbs).toBeLessThan(
      measureSignal(dry.liveAt441, PARITY_SR).peakAbs,
    );
  }, 180_000);

  it("4 limiter — peak reduction vs dry (not true-peak)", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 200, amp: 0.9 });
    const dry = await renderOfflineAndLive(
      pcm,
      baseDocument({ timelineLengthMs: TIMELINE_MS }),
    );
    const lim = await renderOfflineAndLive(
      pcm,
      baseDocument({
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
      }),
    );
    expect(
      measureSignal(lim.offline.interleaved, PARITY_SR).peakAbs,
    ).toBeLessThan(measureSignal(dry.offline.interleaved, PARITY_SR).peakAbs);
    expect(measureSignal(lim.liveAt441, PARITY_SR).peakAbs).toBeLessThan(
      measureSignal(dry.liveAt441, PARITY_SR).peakAbs,
    );
  }, 180_000);

  it("5 delay — wet energy after ~100 ms (live native + offline)", async () => {
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
    const { offline, live, liveTrim } = await renderOfflineAndLive(
      pcm,
      document,
      plan.exportDurationMs,
    );

    const delayFrames44 = Math.round(0.1 * PARITY_SR);
    const tol44 = Math.round(0.005 * PARITY_SR); // ±5 ms (MediaElement skew)
    const echoOff = windowEnergy(
      offline.interleaved,
      delayFrames44 - tol44,
      delayFrames44 + tol44 + 300,
    );
    expect(echoOff).toBeGreaterThan(0);

    const delayFramesLive = Math.round(0.1 * live.sampleRate);
    const tolLive = Math.round(0.01 * live.sampleRate); // ±10 ms at native SR
    const echoLive = windowEnergy(
      liveTrim,
      delayFramesLive - tolLive,
      delayFramesLive + tolLive + Math.round(0.02 * live.sampleRate),
    );
    expect(echoLive).toBeGreaterThan(0);
  }, 180_000);

  it("6 reverb — wet energy present; IR not identical", async () => {
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
    const { offline, liveAt441 } = await renderOfflineAndLive(
      pcm,
      document,
      plan.exportDurationMs,
    );
    expect(windowEnergy(offline.interleaved, 512, 512 + 8000)).toBeGreaterThan(
      0,
    );
    expect(windowEnergy(liveAt441, 0, 12_000)).toBeGreaterThan(0);
    const { correlation } = bestCorrelateMono(
      offline.interleaved,
      liveAt441,
      1024,
    );
    // Measurement only — Math.random IR vs seeded; no PASS on correlation.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ case: 6, reverbCorrelation: correlation }));
    expect(typeof correlation).toBe("number");
  }, 180_000);

  it("7 track + master FX — finite audio both paths", async () => {
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
      masterFxChain: {
        schemaVersion: 1,
        effects: [
          {
            id: "11111111-1111-4111-8111-111111111103",
            type: "limiter",
            enabled: true,
            params: { thresholdDb: -6, ceilingDb: -3 },
          },
        ],
      },
    });
    const { offline, liveAt441 } = await renderOfflineAndLive(pcm, document);
    expect(measureSignal(offline.interleaved, PARITY_SR).nanInfCount).toBe(0);
    expect(measureSignal(liveAt441, PARITY_SR).nanInfCount).toBe(0);
    expect(measureSignal(offline.interleaved, PARITY_SR).rms).toBeGreaterThan(0);
    expect(measureSignal(liveAt441, PARITY_SR).rms).toBeGreaterThan(0);
  }, 180_000);

  it("8 pan / gain / mute / fade + scheduling notes", async () => {
    const pcm = sinePcm({ durationMs: TIMELINE_MS, hz: 440, amp: 0.3 });

    // Mute: offline EMPTY_SESSION; live silence.
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

    const mutedLive = await renderViaStudioAudioEngine({
      sourcePcm: pcm.interleaved,
      sourceFrames: pcm.frames,
      sourceSampleRate: PARITY_SR,
      document: mutedDoc,
      captureDurationMs: TIMELINE_MS,
    });
    expect(
      measureSignal(mutedLive.interleaved, mutedLive.sampleRate).rms,
    ).toBeLessThan(1e-4);

    const g0 = await renderOfflineAndLive(
      pcm,
      baseDocument({ timelineLengthMs: TIMELINE_MS }),
    );
    const gDown = await renderOfflineAndLive(
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
    expect(measureSignal(gDown.liveAt441, PARITY_SR).rms).toBeLessThan(
      measureSignal(g0.liveAt441, PARITY_SR).rms,
    );

    const panL = await renderOfflineAndLive(
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
    const mLive = measureSignal(panL.liveAt441, PARITY_SR);
    const mOff = measureSignal(panL.offline.interleaved, PARITY_SR);
    expect(mOff.energyL).toBeGreaterThan(mOff.energyR);
    expect(mLive.energyL).toBeGreaterThan(mLive.energyR);

    const faded = await renderOfflineAndLive(
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
    expect(
      windowEnergy(faded.offline.interleaved, 20_000, 30_000),
    ).toBeGreaterThan(windowEnergy(faded.offline.interleaved, 0, 2000));
    // Live fade: early window quieter than late (after onset align not required).
    expect(windowEnergy(faded.liveAt441, 20_000, 30_000)).toBeGreaterThan(
      windowEnergy(faded.liveAt441, 0, 2000),
    );
  }, 240_000);
});
