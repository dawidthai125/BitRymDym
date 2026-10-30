/**
 * BRD Tune (Gold) — live playback of manual notes. The realtime worklet has no
 * timeline anchor, so a track whose tune insert carries manual notes is
 * pre-rendered per clip with the SAME TuneCore the note preview and the E3
 * render run (anchored on the timeline, latency compensated). Live playback
 * then plays the baked clip and runs only the effects after the tune insert.
 * Framework-free: shared by the engine, the bake worker and tests.
 */
import {
  interpretStudioFxChainForPlayback,
  type StudioFxInstance,
} from "@/lib/studio/studio-fx-chain";
import { buildStudioOfflineFxChain } from "@/lib/studio/studio-offline-fx";

import { TuneCore } from "./tune-core";
import { toTuneCoreParams } from "./tune";

type TuneEffect = Extract<StudioFxInstance, { type: "tune" }>;

export type TuneBakeSpec = {
  /** Index of the tune insert in `effects` (chain prefix up to it is baked). */
  tuneIndex: number;
  /** Raw effects before the tune insert (baked in front of it, same order). */
  prefix: unknown[];
  tune: TuneEffect;
  /** Stable content key of prefix + tune (params, notes, enabled flags). */
  chainKey: string;
};

/** FNV-1a ×2 → 16 hex chars (cache key, not security). */
export function tuneBakeHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000197) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * Bake spec when the chain has an enabled tune insert with manual notes, else
 * null (realtime path). The first such insert wins; later inserts stay live.
 */
export function tuneBakeSpecForChain(rawChain: unknown): TuneBakeSpec | null {
  if (!rawChain || typeof rawChain !== "object") return null;
  const plan = interpretStudioFxChainForPlayback(rawChain);
  if (plan.kind !== "chain") return null;
  const effects = Array.isArray((rawChain as { effects?: unknown }).effects)
    ? (rawChain as { effects: unknown[] }).effects
    : [];
  for (let i = 0; i < plan.slots.length; i += 1) {
    const slot = plan.slots[i]!;
    if (slot.status !== "ready" || slot.effect.type !== "tune") continue;
    const tune = slot.effect as TuneEffect;
    if (!tune.notes?.length) continue;
    const prefix = effects.slice(0, i);
    const chainKey = tuneBakeHash(JSON.stringify({ prefix, params: tune.params, notes: tune.notes }));
    return { tuneIndex: i, prefix, tune, chainKey };
  }
  return null;
}

/** Live chain for a baked track: only the effects after the tune insert. */
export function bakedPlaybackChain(rawChain: unknown, spec: TuneBakeSpec): unknown {
  const o = rawChain as { effects: unknown[] } & Record<string, unknown>;
  return { ...o, effects: o.effects.slice(spec.tuneIndex + 1) };
}

/** Timeline ms where the clip's source sample 0 sits (TuneCore anchor). */
export function clipSourceOriginMs(clip: { timelineStartMs: number; sourceOffsetMs: number }): number {
  return clip.timelineStartMs - clip.sourceOffsetMs;
}

/** Cache key of one baked clip: chain content + anchor + source + rate. */
export function tuneBakeClipKey(
  spec: TuneBakeSpec,
  clip: { timelineStartMs: number; sourceOffsetMs: number },
  sourceIdentity: string,
  sampleRate: number,
): string {
  return `${spec.chainKey}:${tuneBakeHash(`${clipSourceOriginMs(clip)}|${sourceIdentity}|${sampleRate}`)}`;
}

export type TuneBakeJob = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  prefix: unknown[];
  tune: TuneEffect;
  originMs: number;
};

/**
 * Prefix FX (whole buffer) then TuneCore anchored at originMs, latency
 * compensated, in place. Returns a stepper so the browser can run it in
 * small slices between frames (no Worker needed, UI stays responsive).
 */
function tunedSourceStepper(job: TuneBakeJob): { total: number; run: (from: number, to: number) => void } {
  const { left, right, sampleRate: sr } = job;
  const len = Math.min(left.length, right.length);
  if (job.prefix.length) {
    buildStudioOfflineFxChain({ schemaVersion: 1, effects: job.prefix }, "track", sr)?.processBuffer(left, right);
  }
  const core = new TuneCore(sr, 2, toTuneCoreParams(job.tune.params, job.tune.notes));
  core.setTimeOrigin(Math.round((job.originMs / 1000) * sr));
  const L = core.latency;
  return {
    total: len + L,
    run(from, to) {
      for (let i = from; i < to; i += 1) {
        core.step(i < len ? left[i]! : 0, i < len ? right[i]! : 0);
        if (i >= L) {
          left[i - L] = core.outL;
          right[i - L] = core.outR;
        }
      }
    },
  };
}

export function renderTunedSource(job: TuneBakeJob): { left: Float32Array; right: Float32Array } {
  const s = tunedSourceStepper(job);
  s.run(0, s.total);
  return { left: job.left, right: job.right };
}

/** Same result as renderTunedSource, yielding to the event loop between slices. */
export async function renderTunedSourceSliced(
  job: TuneBakeJob,
  opts: { signal?: AbortSignal; sliceSamples?: number; yieldNow?: () => Promise<void> } = {},
): Promise<{ left: Float32Array; right: Float32Array }> {
  const slice = Math.max(1024, opts.sliceSamples ?? 8192);
  const yieldNow = opts.yieldNow ?? (() => new Promise<void>((r) => setTimeout(r, 0)));
  const s = tunedSourceStepper(job);
  for (let from = 0; from < s.total; from += slice) {
    if (opts.signal?.aborted) throw new DOMException("aborted", "AbortError");
    s.run(from, Math.min(s.total, from + slice));
    await yieldNow();
  }
  return { left: job.left, right: job.right };
}

/** 16-bit PCM stereo WAV (plays in every browser's <audio>, incl. iOS Safari). */
export function encodeWavPcm16(left: Float32Array, right: Float32Array, sampleRate: number): ArrayBuffer {
  const n = Math.min(left.length, right.length);
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i += 1) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * 4, true);
  const pcm = new Int16Array(buf, 44, n * 2);
  for (let i = 0; i < n; i += 1) {
    const l = Math.max(-1, Math.min(1, left[i]!));
    const r = Math.max(-1, Math.min(1, right[i]!));
    pcm[2 * i] = l < 0 ? l * 0x8000 : l * 0x7fff;
    pcm[2 * i + 1] = r < 0 ? r * 0x8000 : r * 0x7fff;
  }
  return buf;
}
