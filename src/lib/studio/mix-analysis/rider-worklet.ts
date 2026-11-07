/**
 * Browser preview of the vocal rider. Same VocalLevelCore as the offline render.
 * Served same-origin from /api/studio/rider-worklet. Until it loads, the slot is dry.
 */
import { VocalLevelCore, type VocalLevelParams } from "./vocal-level";

export const RIDER_WORKLET_NAME = "brd-rider";
export const RIDER_WORKLET_URL = "/api/studio/rider-worklet";

export function buildRiderWorkletSource(): string {
  return `"use strict";
const VocalLevelCore = (${VocalLevelCore.toString()});
class BrdRiderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.core = new VocalLevelCore(sampleRate, o.params || {});
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
registerProcessor(${JSON.stringify(RIDER_WORKLET_NAME)}, BrdRiderProcessor);
`;
}

type WorkletCapableContext = {
  audioWorklet?: { addModule(url: string): Promise<void> };
};

export type RiderNodeLike = {
  connect(dest: unknown): unknown;
  disconnect(): void;
  port: { postMessage(message: unknown): void };
};

const ready = new WeakSet<object>();
const loading = new WeakMap<object, Promise<boolean>>();

export function isRiderWorkletReady(ctx: object): boolean {
  return ready.has(ctx);
}

export function ensureRiderWorklet(ctx: object): Promise<boolean> {
  if (ready.has(ctx)) return Promise.resolve(true);
  const pending = loading.get(ctx);
  if (pending) return pending;
  const worklet = (ctx as WorkletCapableContext).audioWorklet;
  if (!worklet || typeof worklet.addModule !== "function") return Promise.resolve(false);
  const p = worklet
    .addModule(RIDER_WORKLET_URL)
    .then(() => {
      ready.add(ctx);
      return true;
    })
    .catch(() => false);
  loading.set(ctx, p);
  return p;
}

export function createRiderNode(ctx: object, params: VocalLevelParams): RiderNodeLike | null {
  if (!ready.has(ctx)) return null;
  const Ctor = (globalThis as { AudioWorkletNode?: new (c: unknown, name: string, o: unknown) => RiderNodeLike }).AudioWorkletNode;
  if (!Ctor) return null;
  try {
    return new Ctor(ctx, RIDER_WORKLET_NAME, {
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
