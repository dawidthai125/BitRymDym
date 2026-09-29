/**
 * E3.6-B — server-basic-v1 Basic Mix + Basic Master bake (Node PCM).
 * Not a 1:1 port of webaudio-basic-v1. Param schema shared via MixParameters.
 *
 * G1: in-repo pure Float32 DSP (no new DSP package).
 * G3: Node runtime.
 * G5: soft loudness makeup toward master.basicLoudness.targetLufs (RMS-based),
 *     not full ITU-R BS.1770 — documented approximation.
 */

import { AUDIO_CODEC } from "@/config/audio-render";
import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import type { MixParameters } from "@/lib/mix/params";

export const SERVER_BASIC_BAKE_ENGINE = "server-basic-v1" as const;

export const SERVER_BASIC_TARGET_SAMPLE_RATE = AUDIO_CODEC.WAV_SAMPLE_RATE; // 44100

export type ServerBasicBakeResult = {
  engineId: typeof SERVER_BASIC_BAKE_ENGINE;
  sampleRate: number;
  channels: 2;
  /** Interleaved stereo Float32 PCM. */
  interleaved: Float32Array;
  frames: number;
  durationMs: number;
};

function dbToGain(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

function clampSample(x: number): number {
  if (x > 1) return 1;
  if (x < -1) return -1;
  return x;
}

/** Linear resample interleaved stereo to target rate. */
export function resampleStereoInterleaved(
  input: DecodedPcmStereo,
  targetRate: number,
): DecodedPcmStereo {
  if (input.sampleRate === targetRate) return input;
  const ratio = input.sampleRate / targetRate;
  const outFrames = Math.max(1, Math.floor(input.frames / ratio));
  const out = new Float32Array(outFrames * 2);
  for (let i = 0; i < outFrames; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.frames - 1);
    const t = src - i0;
    for (let ch = 0; ch < 2; ch++) {
      const a = input.interleaved[i0 * 2 + ch] ?? 0;
      const b = input.interleaved[i1 * 2 + ch] ?? 0;
      out[i * 2 + ch] = a + (b - a) * t;
    }
  }
  return {
    sampleRate: targetRate,
    channels: 2,
    interleaved: out,
    frames: outFrames,
  };
}

function applyGainPan(
  interleaved: Float32Array,
  frames: number,
  gainDb: number,
  pan: number,
): void {
  const g = dbToGain(gainDb);
  const p = Math.max(-1, Math.min(1, pan));
  const leftG = g * Math.min(1, 1 - p);
  const rightG = g * Math.min(1, 1 + p);
  for (let i = 0; i < frames; i++) {
    const l = interleaved[i * 2] ?? 0;
    const r = interleaved[i * 2 + 1] ?? 0;
    interleaved[i * 2] = l * leftG;
    interleaved[i * 2 + 1] = r * rightG;
  }
}

/** Very small 3-band shelf/peak approximation (per-sample IIR, stereo). */
function applyBasicEq(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  eq: MixParameters["eq"],
): void {
  // One-pole shelves + peaking via cascaded simple filters (approximation).
  const lowG = dbToGain(eq.lowGainDb);
  const midG = dbToGain(eq.midGainDb);
  const highG = dbToGain(eq.highGainDb);
  const lp = Math.exp((-2 * Math.PI * 120) / sampleRate);
  const hp = Math.exp((-2 * Math.PI * 8000) / sampleRate);
  let lpL = 0;
  let lpR = 0;
  let hpL = 0;
  let hpR = 0;
  for (let i = 0; i < frames; i++) {
    let l = interleaved[i * 2] ?? 0;
    let r = interleaved[i * 2 + 1] ?? 0;
    lpL = lp * lpL + (1 - lp) * l;
    lpR = lp * lpR + (1 - lp) * r;
    const lowL = lpL;
    const lowR = lpR;
    hpL = hp * (hpL + l - (interleaved[(i - 1) * 2] ?? l));
    hpR = hp * (hpR + r - (interleaved[(i - 1) * 2 + 1] ?? r));
    const highL = l - lpL;
    const highR = r - lpR;
    const midL = l - lowL - highL;
    const midR = r - lowR - highR;
    interleaved[i * 2] = lowL * lowG + midL * midG + highL * highG;
    interleaved[i * 2 + 1] = lowR * lowG + midR * midG + highR * highG;
  }
}

function applySimpleCompressor(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  c: MixParameters["compressor"],
): void {
  const threshold = dbToGain(c.thresholdDb);
  const ratio = Math.max(1, c.ratio);
  const attack = Math.exp((-1 / sampleRate) * (1000 / Math.max(1, c.attackMs)));
  const release = Math.exp((-1 / sampleRate) * (1000 / Math.max(1, c.releaseMs)));
  let env = 0;
  for (let i = 0; i < frames; i++) {
    const l = interleaved[i * 2] ?? 0;
    const r = interleaved[i * 2 + 1] ?? 0;
    const level = Math.max(Math.abs(l), Math.abs(r));
    env = level > env ? attack * env + (1 - attack) * level : release * env + (1 - release) * level;
    let gain = 1;
    if (env > threshold && threshold > 0) {
      const over = env / threshold;
      const compressed = Math.pow(over, 1 - 1 / ratio);
      gain = compressed / over;
    }
    interleaved[i * 2] = l * gain;
    interleaved[i * 2 + 1] = r * gain;
  }
}

function applyLimiterCeiling(
  interleaved: Float32Array,
  frames: number,
  thresholdDb: number,
  ceilingDb: number,
): void {
  const thr = dbToGain(thresholdDb);
  const ceil = dbToGain(ceilingDb);
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      let s = interleaved[i * 2 + ch] ?? 0;
      const a = Math.abs(s);
      if (a > thr) {
        const sign = s < 0 ? -1 : 1;
        s = sign * (thr + (a - thr) / 20);
      }
      interleaved[i * 2 + ch] = clampSample(s * (ceil < 1 ? 1 : 1));
      if (Math.abs(interleaved[i * 2 + ch]!) > ceil) {
        interleaved[i * 2 + ch] =
          Math.sign(interleaved[i * 2 + ch]!) * ceil;
      }
    }
  }
}

function applyDelay(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  d: MixParameters["delay"],
): void {
  const mix = Math.max(0, Math.min(1, d.mix));
  if (mix <= 0) return;
  const delayFrames = Math.max(
    1,
    Math.floor((d.timeMs / 1000) * sampleRate),
  );
  const feedback = Math.max(0, Math.min(0.95, d.feedback));
  const out = new Float32Array(interleaved.length);
  for (let i = 0; i < frames; i++) {
    for (let ch = 0; ch < 2; ch++) {
      const dry = interleaved[i * 2 + ch] ?? 0;
      const di = i - delayFrames;
      const delayed =
        di >= 0 ? (out[di * 2 + ch] ?? 0) * feedback + (interleaved[di * 2 + ch] ?? 0) : 0;
      out[i * 2 + ch] = dry * (1 - mix) + delayed * mix;
    }
  }
  interleaved.set(out);
}

/** Lightweight feedback echo stand-in for Basic reverb mix/decay. */
function applyReverbApprox(
  interleaved: Float32Array,
  frames: number,
  sampleRate: number,
  r: MixParameters["reverb"],
): void {
  const mix = Math.max(0, Math.min(1, r.mix));
  if (mix <= 0) return;
  const delayFrames = Math.max(
    1,
    Math.floor(Math.min(0.08, Math.max(0.02, r.decaySeconds * 0.05)) * sampleRate),
  );
  const feedback = Math.max(0.05, Math.min(0.85, r.decaySeconds / 4));
  applyDelay(interleaved, frames, sampleRate, {
    mix,
    timeMs: (delayFrames / sampleRate) * 1000,
    feedback,
  });
}

function mixBuses(
  take: Float32Array,
  beat: Float32Array,
  frames: number,
): Float32Array {
  const out = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    out[i * 2] = (take[i * 2] ?? 0) + (beat[i * 2] ?? 0);
    out[i * 2 + 1] = (take[i * 2 + 1] ?? 0) + (beat[i * 2 + 1] ?? 0);
  }
  return out;
}

function padOrTrim(interleaved: Float32Array, frames: number): Float32Array {
  const need = frames * 2;
  if (interleaved.length === need) return interleaved;
  const out = new Float32Array(need);
  out.set(interleaved.subarray(0, Math.min(interleaved.length, need)));
  return out;
}

function measureRmsDb(interleaved: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < interleaved.length; i++) {
    const s = interleaved[i] ?? 0;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, interleaved.length));
  if (rms <= 1e-12) return -100;
  return 20 * Math.log10(rms);
}

function applyMaster(
  interleaved: Float32Array,
  frames: number,
  master: MixParameters["master"],
  options?: { applyLoudnessMakeup?: boolean },
): void {
  const g = dbToGain(master.gainDb);
  for (let i = 0; i < interleaved.length; i++) {
    interleaved[i] = (interleaved[i] ?? 0) * g;
  }
  applyLimiterCeiling(
    interleaved,
    frames,
    master.basicLimiter.thresholdDb,
    master.basicLimiter.ceilingDb,
  );
  if (master.clipProtect) {
    for (let i = 0; i < interleaved.length; i++) {
      interleaved[i] = clampSample(interleaved[i] ?? 0);
    }
  }
  if (options?.applyLoudnessMakeup === false) return;
  // G5 — soft loudness makeup (RMS proxy toward target LUFS).
  const measured = measureRmsDb(interleaved);
  const target = master.basicLoudness.targetLufs;
  const delta = target - measured;
  const makeup = dbToGain(Math.max(-12, Math.min(12, delta * 0.5)));
  for (let i = 0; i < interleaved.length; i++) {
    interleaved[i] = clampSample((interleaved[i] ?? 0) * makeup);
  }
}

/**
 * Bake take + beat PCM with frozen MixParameters → stereo PCM @ 44.1 kHz.
 * Pro params ignored (Basic path only).
 */
export function bakeServerBasicV1(params: {
  take: DecodedPcmStereo;
  beat: DecodedPcmStereo;
  parameters: MixParameters;
  /** Test / diagnostics — default applies G5 soft RMS makeup. */
  applyLoudnessMakeup?: boolean;
}): ServerBasicBakeResult {
  const targetRate = SERVER_BASIC_TARGET_SAMPLE_RATE;
  // Copy inputs — bake mutates working buffers only.
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
  applyMaster(bus, frames, params.parameters.master, {
    applyLoudnessMakeup: params.applyLoudnessMakeup !== false,
  });

  return {
    engineId: SERVER_BASIC_BAKE_ENGINE,
    sampleRate: targetRate,
    channels: 2,
    interleaved: bus,
    frames,
    durationMs: Math.round((frames / targetRate) * 1000),
  };
}
