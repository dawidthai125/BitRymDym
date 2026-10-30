/**
 * BRD Tune — browser preview via AudioWorklet. The processor embeds the SAME
 * `TuneCore` class (source text) that the offline/E3 render runs, so the
 * preview and the render differ only by the (compensated) fixed latency.
 * Served same-origin from /api/studio/tune-worklet (CSP: script-src 'self').
 */
import { TuneCore, type TuneCoreParams } from "./tune-core";

export const TUNE_WORKLET_NAME = "brd-tune";
export const TUNE_WORKLET_URL = "/api/studio/tune-worklet";

/** Full AudioWorkletGlobalScope module source. */
export function buildTuneWorkletSource(): string {
  return `"use strict";
const TuneCore = (${TuneCore.toString()});
class BrdTuneProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.core = new TuneCore(sampleRate, 2, o.params || {});
    this.zero = new Float32Array(128);
    this.port.onmessage = (e) => {
      if (e.data && e.data.params) this.core.setParams(e.data.params);
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!out || !out[0]) return true;
    const frames = out[0].length;
    if (this.zero.length < frames) this.zero = new Float32Array(frames);
    const inp = inputs[0] || [];
    const l = inp[0] || this.zero;
    const r = inp[1] || l;
    this.core.processBlock(l, r, out[0], out[1] || out[0], frames);
    return true;
  }
}
registerProcessor(${JSON.stringify(TUNE_WORKLET_NAME)}, BrdTuneProcessor);
`;
}

type WorkletCapableContext = {
  audioWorklet?: { addModule(url: string): Promise<void> };
};

export type TuneNodeLike = {
  connect(dest: unknown): unknown;
  disconnect(): void;
  port: { postMessage(message: unknown): void };
};

const ready = new WeakSet<object>();
const loading = new WeakMap<object, Promise<boolean>>();

export function isTuneWorkletReady(ctx: object): boolean {
  return ready.has(ctx);
}

/** Loads the processor once per AudioContext. Resolves false when unsupported. */
export function ensureTuneWorklet(ctx: object): Promise<boolean> {
  if (ready.has(ctx)) return Promise.resolve(true);
  const pending = loading.get(ctx);
  if (pending) return pending;
  const worklet = (ctx as WorkletCapableContext).audioWorklet;
  if (!worklet || typeof worklet.addModule !== "function") return Promise.resolve(false);
  const p = worklet
    .addModule(TUNE_WORKLET_URL)
    .then(() => {
      ready.add(ctx);
      return true;
    })
    .catch(() => false);
  loading.set(ctx, p);
  return p;
}

/** New tune node on a ready context, or null (caller wires dry). */
export function createTuneNode(ctx: object, params: TuneCoreParams): TuneNodeLike | null {
  if (!ready.has(ctx)) return null;
  const Ctor = (globalThis as { AudioWorkletNode?: new (c: unknown, name: string, o: unknown) => TuneNodeLike })
    .AudioWorkletNode;
  if (!Ctor) return null;
  try {
    return new Ctor(ctx, TUNE_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { params },
    });
  } catch {
    return null;
  }
}
