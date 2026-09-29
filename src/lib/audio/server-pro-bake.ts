/**
 * E3.7-A — server-pro-v1 Pro Mix bake (Node PCM).
 * OD-E37-01: Master Plan A is wired in E3.7-B (not Basic fallback).
 *
 * CLIENT PREVIEW = webaudio-pro-v1 (mix-graph) — approximation only.
 * FINAL SERVER TRUTH = this engine — deterministic Float32 DSP.
 *
 * Reuses MixProParams + shared helpers from server-basic-bake (REUSE FIRST).
 * Does NOT fall back to server-basic-v1.
 */

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  SERVER_BASIC_TARGET_SAMPLE_RATE,
  applyBasicEq,
  applyDelay,
  applyGainPan,
  applyLimiterCeiling,
  applyMaster,
  applyReverbApprox,
  applySimpleCompressor,
  clampSample,
  dbToGain,
  mixBuses,
  padOrTrim,
  resampleStereoInterleaved,
} from "@/lib/audio/server-basic-bake";
import type { MixParameters, MixProParams } from "@/lib/mix/params";

export const SERVER_PRO_BAKE_ENGINE = "server-pro-v1" as const;

export const SERVER_PRO_TARGET_SAMPLE_RATE = SERVER_BASIC_TARGET_SAMPLE_RATE; // 44100

export type ServerProBakeResult = {
  engineId: typeof SERVER_PRO_BAKE_ENGINE;
  sampleRate: number;
  channels: 2;
  interleaved: Float32Array;
  frames: number;
  durationMs: number;
  /** True after Plan A master (E3.7-B). */
  masterApplied: boolean;
};

/** Direct-form I peaking EQ (stereo, in-place). Preview-class equivalent of Biquad peaking. */
function applyPeakingBand(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  frequencyHz: number,
  gainDb: number,
  q: number,
): void {
  if (Math.abs(gainDb) < 1e-6) return;
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * frequencyHz) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Math.max(0.1, q));
  const b0 = 1 + alpha * A;
  const b1 = -2 * cos;
  const b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A;
  const a1 = -2 * cos;
  const a2 = 1 - alpha / A;
  const invA0 = 1 / a0;
  const B0 = b0 * invA0;
  const B1 = b1 * invA0;
  const B2 = b2 * invA0;
  const A1 = a1 * invA0;
  const A2 = a2 * invA0;

  for (let ch = 0; ch < 2; ch++) {
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < frames; i++) {
      const x = interleaved[i * 2 + ch] ?? 0;
      const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
      interleaved[i * 2 + ch] = y;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
    }
  }
}

function applyOnePoleLowpass(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  cutoffHz: number,
  out: Float32Array,
): void {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < frames; i++) {
    const l = interleaved[i * 2] ?? 0;
    const r = interleaved[i * 2 + 1] ?? 0;
    lpL = a * lpL + (1 - a) * l;
    lpR = a * lpR + (1 - a) * r;
    out[i * 2] = lpL;
    out[i * 2 + 1] = lpR;
  }
}

function applyOnePoleHighpass(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  cutoffHz: number,
  out: Float32Array,
): void {
  const a = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let lpL = 0;
  let lpR = 0;
  for (let i = 0; i < frames; i++) {
    const l = interleaved[i * 2] ?? 0;
    const r = interleaved[i * 2 + 1] ?? 0;
    lpL = a * lpL + (1 - a) * l;
    lpR = a * lpR + (1 - a) * r;
    out[i * 2] = l - lpL;
    out[i * 2 + 1] = r - lpR;
  }
}

function compressBandInPlace(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  thresholdDb: number,
  ratio: number,
  makeupDb: number,
): void {
  applySimpleCompressor(interleaved, frames, sampleRate, {
    thresholdDb,
    ratio,
    attackMs: 8,
    releaseMs: 80,
  });
  const makeup = dbToGain(makeupDb);
  if (Math.abs(makeup - 1) < 1e-9) return;
  for (let i = 0; i < interleaved.length; i++) {
    interleaved[i] = (interleaved[i] ?? 0) * makeup;
  }
}

/** Multiband approximation matching client preview split (250 / 1000 / 2500). */
function applyProMultiband(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  mb: MixProParams["multiband"],
): void {
  const low = new Float32Array(interleaved.length);
  const high = new Float32Array(interleaved.length);
  const mid = new Float32Array(interleaved.length);
  applyOnePoleLowpass(interleaved, frames, sampleRate, 250, low);
  applyOnePoleHighpass(interleaved, frames, sampleRate, 2500, high);
  for (let i = 0; i < interleaved.length; i++) {
    mid[i] = (interleaved[i] ?? 0) - (low[i] ?? 0) - (high[i] ?? 0);
  }
  compressBandInPlace(
    low,
    frames,
    sampleRate,
    mb.low.thresholdDb,
    mb.low.ratio,
    mb.low.makeupDb,
  );
  compressBandInPlace(
    mid,
    frames,
    sampleRate,
    mb.mid.thresholdDb,
    mb.mid.ratio,
    mb.mid.makeupDb,
  );
  compressBandInPlace(
    high,
    frames,
    sampleRate,
    mb.high.thresholdDb,
    mb.high.ratio,
    mb.high.makeupDb,
  );
  for (let i = 0; i < interleaved.length; i++) {
    interleaved[i] = (low[i] ?? 0) + (mid[i] ?? 0) + (high[i] ?? 0);
  }
}

function applyDeEsser(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  d: MixProParams["deEsser"],
): void {
  // Preview uses peaking cut of -min(rangeDb, 12); threshold is reserved for later dynamics.
  void d.thresholdDb;
  const cutDb = -Math.min(d.rangeDb, 12);
  applyPeakingBand(interleaved, frames, sampleRate, d.frequencyHz, cutDb, 2);
}

function applyChorusApprox(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  mix: number,
  depth: number,
): void {
  const wetMix = Math.max(0, Math.min(1, mix)) * Math.max(0, Math.min(1, depth));
  if (wetMix <= 0) return;
  const delayFrames = Math.max(1, Math.floor(0.02 * sampleRate));
  const out = new Float32Array(interleaved.length);
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      const dry = interleaved[i * 2 + ch] ?? 0;
      const di = i - delayFrames;
      const wet = di >= 0 ? (interleaved[di * 2 + ch] ?? 0) : 0;
      out[i * 2 + ch] = dry * (1 - wetMix) + wet * wetMix;
    }
  }
  interleaved.set(out);
}

/**
 * Apply MixProParams take-chain (eqBands → multiband → deEsser → fxChain).
 * Mutates take buffer in place.
 */
export function applyProTakeChain(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  pro: MixProParams,
): void {
  for (const band of pro.eqBands) {
    applyPeakingBand(
      interleaved,
      frames,
      sampleRate,
      band.frequencyHz,
      band.gainDb,
      band.q,
    );
  }
  applyProMultiband(interleaved, frames, sampleRate, pro.multiband);
  applyDeEsser(interleaved, frames, sampleRate, pro.deEsser);
  for (const fx of pro.fxChain) {
    if (fx.type === "filter") {
      applyPeakingBand(
        interleaved,
        frames,
        sampleRate,
        fx.frequencyHz,
        fx.gainDb,
        fx.q,
      );
    } else {
      applyChorusApprox(interleaved, frames, sampleRate, fx.mix, fx.depth);
    }
  }
}

function assertValidMaster(master: MixParameters["master"]): void {
  if (!master || typeof master !== "object") {
    throw new RenderJobDomainError(
      "server-pro-v1: missing master parameters.",
      "INVALID",
    );
  }
  if (
    typeof master.gainDb !== "number" ||
    !Number.isFinite(master.gainDb) ||
    !master.basicLimiter ||
    !master.basicLoudness ||
    typeof master.clipProtect !== "boolean"
  ) {
    throw new RenderJobDomainError(
      "server-pro-v1: invalid master parameters.",
      "INVALID",
    );
  }
}

/**
 * Shared Pro Mix prep through Basic bus (no master).
 * Used by mix-only diagnostics and full Final Truth bake.
 */
function bakeServerProV1ThroughBus(params: {
  take: DecodedPcmStereo;
  beat: DecodedPcmStereo;
  parameters: MixParameters;
}): { bus: Float32Array; frames: number; targetRate: number } {
  if (!params.parameters.pro) {
    throw new RenderJobDomainError(
      "server-pro-v1 requires parameters.pro (MIX_PRO). No Basic fallback.",
      "INVALID",
    );
  }
  assertValidMaster(params.parameters.master);

  const targetRate = SERVER_PRO_TARGET_SAMPLE_RATE;
  let take = resampleStereoInterleaved(
    {
      ...params.take,
      interleaved: new Float32Array(params.take.interleaved),
    },
    targetRate,
  );
  let beat = resampleStereoInterleaved(
    {
      ...params.beat,
      interleaved: new Float32Array(params.beat.interleaved),
    },
    targetRate,
  );
  const frames = Math.max(take.frames, beat.frames);
  take = {
    ...take,
    interleaved: padOrTrim(take.interleaved, frames),
    frames,
  };
  beat = {
    ...beat,
    interleaved: padOrTrim(beat.interleaved, frames),
    frames,
  };

  applyGainPan(
    take.interleaved,
    frames,
    params.parameters.take.gainDb,
    params.parameters.take.pan,
  );
  applyGainPan(
    beat.interleaved,
    frames,
    params.parameters.beat.gainDb,
    params.parameters.beat.pan,
  );

  applyProTakeChain(
    take.interleaved,
    frames,
    targetRate,
    params.parameters.pro,
  );

  const bus = mixBuses(take.interleaved, beat.interleaved, frames);
  applyBasicEq(bus, frames, targetRate, params.parameters.eq);
  applySimpleCompressor(bus, frames, targetRate, params.parameters.compressor);
  applyLimiterCeiling(
    bus,
    frames,
    params.parameters.limiter.thresholdDb,
    params.parameters.limiter.ceilingDb,
  );
  applyReverbApprox(bus, frames, targetRate, params.parameters.reverb);
  applyDelay(bus, frames, targetRate, params.parameters.delay);

  return { bus, frames, targetRate };
}

/**
 * E3.7-A — Pro Mix through Basic bus stages only (masterApplied=false).
 * Prefer bakeServerProV1 for Premium Final Truth (includes Master Plan A).
 */
export function bakeServerProV1Mix(params: {
  take: DecodedPcmStereo;
  beat: DecodedPcmStereo;
  parameters: MixParameters;
}): ServerProBakeResult {
  const { bus, frames, targetRate } = bakeServerProV1ThroughBus(params);
  for (let i = 0; i < bus.length; i++) {
    bus[i] = clampSample(bus[i] ?? 0);
  }
  return {
    engineId: SERVER_PRO_BAKE_ENGINE,
    sampleRate: targetRate,
    channels: 2,
    interleaved: bus,
    frames,
    durationMs: Math.round((frames / targetRate) * 1000),
    masterApplied: false,
  };
}

/**
 * E3.7-B — Premium Final Truth bake:
 * Pro Mix → Master Plan A (existing MasterParameters) → PCM @ 44.1 stereo.
 * No fallback to server-basic-v1.
 */
export function bakeServerProV1(params: {
  take: DecodedPcmStereo;
  beat: DecodedPcmStereo;
  parameters: MixParameters;
  /** Test / diagnostics — default applies G5 soft RMS makeup. */
  applyLoudnessMakeup?: boolean;
}): ServerProBakeResult {
  const { bus, frames, targetRate } = bakeServerProV1ThroughBus(params);
  applyMaster(bus, frames, params.parameters.master, {
    applyLoudnessMakeup: params.applyLoudnessMakeup !== false,
  });
  return {
    engineId: SERVER_PRO_BAKE_ENGINE,
    sampleRate: targetRate,
    channels: 2,
    interleaved: bus,
    frames,
    durationMs: Math.round((frames / targetRate) * 1000),
    masterApplied: true,
  };
}
