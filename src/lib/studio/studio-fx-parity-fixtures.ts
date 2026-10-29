/**
 * Stage I.13b — in-memory Studio FX parity fixtures (44.1 kHz stereo).
 */

import type { DecodedPcmStereo } from "@/lib/audio/render-decode";
import {
  addStudioFxToChain,
  createStudioFxInstance,
  emptyStudioFxChain,
  type StudioFxChainV1,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";
import type {
  StudioEngineClip,
  StudioEngineDocument,
  StudioEngineTrack,
} from "@/lib/studio/studio-audio-schedule";
import { STUDIO_OFFLINE_RENDER_SAMPLE_RATE } from "@/lib/studio/studio-offline-render";

export const PARITY_SR = STUDIO_OFFLINE_RENDER_SAMPLE_RATE; // 44100
export const PARITY_TAKE_ID = "parity-take-1";
export const PARITY_TRACK_ID = "parity-track-1";
export const PARITY_CLIP_ID = "parity-clip-1";

export function sinePcm(options: {
  durationMs: number;
  hz?: number;
  amp?: number;
}): DecodedPcmStereo {
  const hz = options.hz ?? 440;
  const amp = options.amp ?? 0.25;
  const frames = Math.max(1, Math.floor((options.durationMs / 1000) * PARITY_SR));
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * hz * i) / PARITY_SR) * amp;
    interleaved[i * 2] = s;
    interleaved[i * 2 + 1] = s;
  }
  return { sampleRate: PARITY_SR, channels: 2, interleaved, frames };
}

/** Unit impulse at frame 0 (transient probe). */
export function impulsePcm(durationMs: number, amp = 0.9): DecodedPcmStereo {
  const frames = Math.max(1, Math.floor((durationMs / 1000) * PARITY_SR));
  const interleaved = new Float32Array(frames * 2);
  interleaved[0] = amp;
  interleaved[1] = amp;
  return { sampleRate: PARITY_SR, channels: 2, interleaved, frames };
}

/** Deterministic broadband-ish noise (xorshift). */
export function noisePcm(durationMs: number, amp = 0.2): DecodedPcmStereo {
  const frames = Math.max(1, Math.floor((durationMs / 1000) * PARITY_SR));
  const interleaved = new Float32Array(frames * 2);
  let s = 0x243f6a88;
  for (let i = 0; i < frames; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    const u = ((s >>> 0) % 1_000_000) / 1_000_000;
    const v = (u * 2 - 1) * amp;
    interleaved[i * 2] = v;
    interleaved[i * 2 + 1] = v;
  }
  return { sampleRate: PARITY_SR, channels: 2, interleaved, frames };
}

function baseTrack(
  partial?: Partial<StudioEngineTrack>,
): StudioEngineTrack {
  return {
    id: PARITY_TRACK_ID,
    gainDb: 0,
    pan: 0,
    muted: false,
    solo: false,
    effectsChain: emptyStudioFxChain(),
    ...partial,
  };
}

function baseClip(partial?: Partial<StudioEngineClip>): StudioEngineClip {
  return {
    id: PARITY_CLIP_ID,
    trackId: PARITY_TRACK_ID,
    sourceKind: "TAKE",
    sourceTakeId: PARITY_TAKE_ID,
    sourceBeatId: null,
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

export function baseDocument(
  partial?: Partial<StudioEngineDocument>,
): StudioEngineDocument {
  const timelineLengthMs = partial?.timelineLengthMs ?? 1000;
  return {
    timelineLengthMs,
    masterGainDb: 0,
    masterPan: 0,
    masterFxChain: emptyStudioFxChain(),
    projectBeatId: null,
    tracks: [baseTrack()],
    clips: [baseClip({ durationMs: timelineLengthMs })],
    ...partial,
  };
}

/** Stable UUIDs required by studio-fx-chain parse (non-UUID ids are skipped). */
const FX_IDS: Record<StudioFxType, string> = {
  eq: "11111111-1111-4111-8111-111111111101",
  compressor: "11111111-1111-4111-8111-111111111102",
  limiter: "11111111-1111-4111-8111-111111111103",
  reverb: "11111111-1111-4111-8111-111111111104",
  delay: "11111111-1111-4111-8111-111111111105",
};

export function chainWith(
  type: StudioFxType,
  role: "track" | "master",
  mutate?: (fx: ReturnType<typeof createStudioFxInstance>) => void,
): StudioFxChainV1 {
  let chain = emptyStudioFxChain();
  chain = addStudioFxToChain(chain, type, role, () => FX_IDS[type]);
  const fx = chain.effects[0]!;
  if (mutate) mutate(fx);
  return chain;
}

export function eqBoostMidChain(): StudioFxChainV1 {
  return chainWith("eq", "track", (fx) => {
    if (fx.type !== "eq") return;
    fx.params.mid.frequencyHz = 1000;
    fx.params.mid.gainDb = 12;
    fx.params.mid.q = 1;
    fx.params.low.gainDb = 0;
    fx.params.high.gainDb = 0;
  });
}

export function eqCutMidChain(): StudioFxChainV1 {
  return chainWith("eq", "track", (fx) => {
    if (fx.type !== "eq") return;
    fx.params.mid.frequencyHz = 1000;
    fx.params.mid.gainDb = -12;
    fx.params.mid.q = 1;
    fx.params.low.gainDb = 0;
    fx.params.high.gainDb = 0;
  });
}

export function compressorChain(): StudioFxChainV1 {
  return chainWith("compressor", "track", (fx) => {
    if (fx.type !== "compressor") return;
    fx.params.thresholdDb = -24;
    fx.params.ratio = 4;
    fx.params.attackMs = 5;
    fx.params.releaseMs = 50;
    fx.params.makeupDb = 0;
  });
}

export function limiterChain(): StudioFxChainV1 {
  return chainWith("limiter", "track", (fx) => {
    if (fx.type !== "limiter") return;
    fx.params.thresholdDb = -12;
    fx.params.ceilingDb = -6;
  });
}

export function delayChain(): StudioFxChainV1 {
  return chainWith("delay", "track", (fx) => {
    if (fx.type !== "delay") return;
    fx.params.timeMs = 100;
    fx.params.feedback = 0;
    fx.params.mix = 0.5;
  });
}

export function reverbChain(): StudioFxChainV1 {
  return chainWith("reverb", "track", (fx) => {
    if (fx.type !== "reverb") return;
    fx.params.mix = 0.7;
    fx.params.decaySeconds = 0.4;
  });
}

export function takeResolver(pcm: DecodedPcmStereo) {
  return async (key: { kind: string; takeId?: string }) => {
    if (key.kind === "TAKE" && key.takeId === PARITY_TAKE_ID) return pcm;
    return null;
  };
}
