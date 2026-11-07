/** Browser preview of the rap pocket. Same PocketLiveCore as the unit test. */
import { PocketLiveCore, type PocketLiveMarker, type PocketLiveParams } from "./pocket-live";

export const POCKET_WORKLET_NAME = "brd-pocket";
export const POCKET_WORKLET_URL = "/api/studio/pocket-worklet";

export function buildPocketWorkletSource(): string {
  return `"use strict";
const PocketLiveCore = (${PocketLiveCore.toString()});
class BrdPocketProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.core = new PocketLiveCore(sampleRate, o.params || {});
    if (o.markers) this.core.setMarkers(o.markers);
    this.zero = new Float32Array(128);
    this.n = 0;
    this.port.onmessage = (e) => {
      const d = (e && e.data) || {};
      if (typeof d.playheadMs === "number") this.core.setPlayhead(d.playheadMs);
      if (d.params) this.core.setParams(d.params);
      if (d.markers) this.core.setMarkers(d.markers);
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
    this.n = (this.n + 1) | 0;
    if ((this.n & 7) === 0) this.port.postMessage({ key: this.core.key, depth: this.core.depth });
    return true;
  }
}
registerProcessor(${JSON.stringify(POCKET_WORKLET_NAME)}, BrdPocketProcessor);
`;
}

type WorkletCapableContext = { audioWorklet?: { addModule(url: string): Promise<void> } };

export type PocketNodeLike = {
  connect(dest: unknown): unknown;
  disconnect(): void;
  port: { postMessage(message: unknown): void; onmessage: ((event: { data?: { key?: unknown; depth?: unknown } }) => void) | null };
};

type PocketPort = PocketNodeLike["port"];

const ready = new WeakSet<object>();
const loading = new WeakMap<object, Promise<boolean>>();
const ports = new Set<PocketPort>();
let publishedMarkers: PocketLiveMarker[] = [];
let liveKey = 0;
let liveDepth = 0;
let lastKeyAt = 0;

function rememberSidechain(data: { key?: unknown; depth?: unknown } | null | undefined): void {
  if (!data) return;
  if (typeof data.key === "number" && Number.isFinite(data.key)) {
    const k = data.key < 0 ? 0 : data.key > 1 ? 1 : data.key;
    liveKey = k > liveKey ? k : liveKey + (k - liveKey) * 0.5;
    lastKeyAt = Date.now();
  }
  if (typeof data.depth === "number" && Number.isFinite(data.depth)) {
    liveDepth = data.depth < 0 ? 0 : data.depth > 1 ? 1 : data.depth;
  }
}

function noteDepth(params: unknown): void {
  if (!params || typeof params !== "object") return;
  const depth = (params as { depth?: unknown }).depth;
  if (typeof depth !== "number" || !Number.isFinite(depth)) return;
  liveDepth = depth < 0 ? 0 : depth > 1 ? 1 : depth;
}

export function isPocketWorkletReady(ctx: object): boolean {
  return ready.has(ctx);
}

export function ensurePocketWorklet(ctx: object): Promise<boolean> {
  if (ready.has(ctx)) return Promise.resolve(true);
  const pending = loading.get(ctx);
  if (pending) return pending;
  const worklet = (ctx as WorkletCapableContext).audioWorklet;
  if (!worklet || typeof worklet.addModule !== "function") return Promise.resolve(false);
  const p = worklet
    .addModule(POCKET_WORKLET_URL)
    .then(() => {
      ready.add(ctx);
      return true;
    })
    .catch(() => false);
  loading.set(ctx, p);
  return p;
}

/** Clock → every live pocket. Absolute timeline position, not a delta. */
export function postPocketPlayhead(ms: number): void {
  const playheadMs = typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
  for (const port of ports) {
    try {
      port.postMessage({ playheadMs });
    } catch {
      ports.delete(port);
    }
  }
}

/** Mix step publishes verse/hook markers. Empty list → verse gain, no double. */
export function publishPocketMarkers(
  markers: readonly { kind: string; positionMs: number }[] | null | undefined,
): void {
  const next: PocketLiveMarker[] = [];
  if (markers) {
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      if (!m) continue;
      if (m.kind !== "verse" && m.kind !== "hook") continue;
      if (typeof m.positionMs !== "number" || !Number.isFinite(m.positionMs)) continue;
      next.push({ kind: m.kind, positionMs: m.positionMs });
    }
  }
  publishedMarkers = next;
  for (const port of ports) {
    try {
      port.postMessage({ markers: publishedMarkers });
    } catch {
      ports.delete(port);
    }
  }
}

/** Slot param edits keep the markers the mix step last published. */
export function postPocketSlot(port: { postMessage(message: unknown): void }, params: unknown): void {
  noteDepth(params);
  try {
    port.postMessage({ params, markers: publishedMarkers });
  } catch {
    /* node already gone */
  }
}

/** Vocal RMS the beat trim reads. Silent when no pocket node is reporting. */
export function readPocketSidechain(): { key: number; depth: number } {
  if (ports.size === 0 || Date.now() - lastKeyAt > 250) return { key: 0, depth: 0 };
  return { key: liveKey, depth: liveDepth };
}

/** Tracks that carry the project beat. Kept out of the engine source on purpose. */
export function pocketBeatTrackIds(clips: readonly { trackId: string; sourceKind?: string }[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    if (clip && clip.sourceKind === "BEAT_REF") ids.add(clip.trackId);
  }
  return ids;
}

export function createPocketNode(ctx: object, params: PocketLiveParams): PocketNodeLike | null {
  if (!ready.has(ctx)) return null;
  const Ctor = (globalThis as { AudioWorkletNode?: new (c: unknown, name: string, o: unknown) => PocketNodeLike }).AudioWorkletNode;
  if (!Ctor) return null;
  try {
    const node = new Ctor(ctx, POCKET_WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      channelCount: 2,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { params, markers: publishedMarkers },
    });
    const port = node.port;
    ports.add(port);
    port.onmessage = (event) => rememberSidechain(event.data);
    noteDepth(params);
    try {
      port.postMessage({ params, markers: publishedMarkers });
    } catch {
      /* ignore */
    }
    return {
      connect: (dest) => node.connect(dest),
      disconnect: () => {
        ports.delete(port);
        if (ports.size === 0) {
          liveKey = 0;
          liveDepth = 0;
        }
        node.disconnect();
      },
      port,
    };
  } catch {
    return null;
  }
}
