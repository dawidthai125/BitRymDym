/** Browser preview of the vocal harmony. Same core as the offline render. */
import { VocalHarmonyCore, type VocalHarmonyParams } from "./vocal-harmony";

export const HARMONY_WORKLET_NAME = "brd-harmony";
export const HARMONY_WORKLET_URL = "/api/studio/harmony-worklet";

export function buildHarmonyWorkletSource(): string {
  return `"use strict";
const VocalHarmonyCore = (${VocalHarmonyCore.toString()});
class BrdHarmonyProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.core = new VocalHarmonyCore(sampleRate, o.params || {});
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
registerProcessor(${JSON.stringify(HARMONY_WORKLET_NAME)}, BrdHarmonyProcessor);
`;
}

type WorkletCapableContext = { audioWorklet?: { addModule(url: string): Promise<void> } };

export type HarmonyNodeLike = {
  connect(dest: unknown): unknown;
  disconnect(): void;
  port: { postMessage(message: unknown): void };
};

const ready = new WeakSet<object>();
const loading = new WeakMap<object, Promise<boolean>>();

export function isHarmonyWorkletReady(ctx: object): boolean {
  return ready.has(ctx);
}

export function ensureHarmonyWorklet(ctx: object): Promise<boolean> {
  if (ready.has(ctx)) return Promise.resolve(true);
  const pending = loading.get(ctx);
  if (pending) return pending;
  const worklet = (ctx as WorkletCapableContext).audioWorklet;
  if (!worklet || typeof worklet.addModule !== "function") return Promise.resolve(false);
  const p = worklet.addModule(HARMONY_WORKLET_URL).then(() => { ready.add(ctx); return true; }).catch(() => false);
  loading.set(ctx, p);
  return p;
}

export function createHarmonyNode(ctx: object, params: VocalHarmonyParams): HarmonyNodeLike | null {
  if (!ready.has(ctx)) return null;
  const Ctor = (globalThis as { AudioWorkletNode?: new (c: unknown, name: string, o: unknown) => HarmonyNodeLike }).AudioWorkletNode;
  if (!Ctor) return null;
  try {
    return new Ctor(ctx, HARMONY_WORKLET_NAME, {
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
