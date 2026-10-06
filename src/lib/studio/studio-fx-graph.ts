/**
 * P6.2 / P6.3 — Track & Master FX Web Audio inserts.
 * Same registry/adapters for both roles. Not E3 Mix. Not a second engine.
 */

import type { StudioAudioErrorCode } from "@/lib/studio/studio-audio-errors";
import {
  interpretStudioFxChainForPlayback,
  studioFxPlaybackFingerprint,
  type StudioFxCompressorParams,
  type StudioFxDelayParams,
  type StudioFxEqParams,
  type StudioFxInstance,
  type StudioFxLimiterParams,
  type StudioFxPlaybackPlan,
  type StudioFxPlaybackSlot,
  type StudioFxReverbParams,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";

type ParamValue = { value: number };

export type StudioFxConnectable = {
  connect(dest: StudioFxConnectable): StudioFxConnectable;
  disconnect(): void;
};

type GainLike = StudioFxConnectable & { gain: ParamValue };

type BiquadLike = StudioFxConnectable & {
  type: string;
  frequency: ParamValue;
  gain: ParamValue;
  Q: ParamValue;
};

type DynamicsLike = StudioFxConnectable & {
  threshold: ParamValue;
  ratio: ParamValue;
  attack: ParamValue;
  release: ParamValue;
  knee: ParamValue;
};

type DelayLike = StudioFxConnectable & { delayTime: ParamValue };

type ConvolverLike = StudioFxConnectable & {
  buffer: unknown;
  normalize: boolean;
};

type BufferLike = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
};

export type StudioFxGraphContext = {
  sampleRate: number;
  createGain(): GainLike;
  createBiquadFilter(): BiquadLike;
  createDynamicsCompressor(): DynamicsLike;
  createDelay(maxDelayTime?: number): DelayLike;
  createConvolver(): ConvolverLike;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): BufferLike;
};

export type StudioFxSlotInspect = {
  type: StudioFxType | "unknown";
  id: string | null;
  mode: "process" | "bypass";
  nodes: string[];
};

type BuiltSlot = {
  input: GainLike;
  output: GainLike;
  inspect: StudioFxSlotInspect;
  apply: (slot: StudioFxPlaybackSlot) => void;
  dispose: () => void;
};

export type StudioTrackFxHandle = {
  input: GainLike;
  output: GainLike;
  fingerprint: string;
  inspect(): StudioFxSlotInspect[];
  applyPlan(plan: StudioFxPlaybackPlan): boolean;
  dispose(): void;
};

function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

function disconnectQuiet(node: StudioFxConnectable): void {
  try {
    node.disconnect();
  } catch {
    /* already disconnected */
  }
}

function setBypassGains(dry: GainLike, wet: GainLike, process: boolean): void {
  dry.gain.value = process ? 0 : 1;
  wet.gain.value = process ? 1 : 0;
}

function applyEq(filters: [BiquadLike, BiquadLike, BiquadLike], params: StudioFxEqParams): void {
  const [low, mid, high] = filters;
  low.type = "lowshelf";
  low.frequency.value = params.low.frequencyHz;
  low.gain.value = params.low.gainDb;
  low.Q.value = params.low.q;
  mid.type = "peaking";
  mid.frequency.value = params.mid.frequencyHz;
  mid.gain.value = params.mid.gainDb;
  mid.Q.value = params.mid.q;
  high.type = "highshelf";
  high.frequency.value = params.high.frequencyHz;
  high.gain.value = params.high.gainDb;
  high.Q.value = params.high.q;
}

function applyCompressor(node: DynamicsLike, makeup: GainLike, params: StudioFxCompressorParams): void {
  node.threshold.value = params.thresholdDb;
  node.ratio.value = params.ratio;
  node.attack.value = params.attackMs / 1000;
  node.release.value = params.releaseMs / 1000;
  node.knee.value = 6;
  makeup.gain.value = dbToGain(params.makeupDb);
}

/**
 * IMPLEMENTATION LIMITATION: not a true-peak / brickwall limiter.
 * P6 foundation uses DynamicsCompressor (high ratio, hard knee) + ceiling Gain,
 * as frozen in P6 Design Freeze. Not LUFS.
 */
function applyLimiter(node: DynamicsLike, ceiling: GainLike, params: StudioFxLimiterParams): void {
  node.threshold.value = params.thresholdDb;
  node.ratio.value = 20;
  node.knee.value = 0;
  node.attack.value = 0.003;
  node.release.value = 0.05;
  ceiling.gain.value = dbToGain(params.ceilingDb);
}

function createImpulse(ctx: StudioFxGraphContext, decaySeconds: number): BufferLike {
  const rate = ctx.sampleRate || 48000;
  const length = Math.max(1, Math.floor(rate * decaySeconds));
  const buffer = ctx.createBuffer(2, length, rate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] =
        (Math.random() * 2 - 1) *
        Math.exp(-i / (rate * (decaySeconds / 3)));
    }
  }
  return buffer;
}

function buildEqSlot(ctx: StudioFxGraphContext, effect: StudioFxInstance): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const low = ctx.createBiquadFilter();
  const mid = ctx.createBiquadFilter();
  const high = ctx.createBiquadFilter();
  input.connect(dry);
  dry.connect(output);
  input.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(wet);
  wet.connect(output);
  const params = effect.params as StudioFxEqParams;
  applyEq([low, mid, high], params);
  setBypassGains(dry, wet, effect.enabled);
  return {
    input,
    output,
    inspect: {
      type: "eq",
      id: effect.id,
      mode: effect.enabled ? "process" : "bypass",
      nodes: ["gain", "biquad-lowshelf", "biquad-peaking", "biquad-highshelf"],
    },
    apply(slot) {
      if (slot.status === "skip") {
        setBypassGains(dry, wet, false);
        this.inspect.mode = "bypass";
        return;
      }
      const next = slot.effect;
      applyEq([low, mid, high], next.params as StudioFxEqParams);
      setBypassGains(dry, wet, slot.status === "ready");
      this.inspect.mode = slot.status === "ready" ? "process" : "bypass";
    },
    dispose() {
      for (const node of [input, output, dry, wet, low, mid, high]) {
        disconnectQuiet(node);
      }
    },
  };
}

function buildCompressorSlot(ctx: StudioFxGraphContext, effect: StudioFxInstance): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const makeup = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  input.connect(comp);
  comp.connect(makeup);
  makeup.connect(wet);
  wet.connect(output);
  applyCompressor(comp, makeup, effect.params as StudioFxCompressorParams);
  setBypassGains(dry, wet, effect.enabled);
  return {
    input,
    output,
    inspect: {
      type: "compressor",
      id: effect.id,
      mode: effect.enabled ? "process" : "bypass",
      nodes: ["gain", "dynamics-compressor", "gain-makeup"],
    },
    apply(slot) {
      if (slot.status === "skip") {
        setBypassGains(dry, wet, false);
        this.inspect.mode = "bypass";
        return;
      }
      applyCompressor(comp, makeup, slot.effect.params as StudioFxCompressorParams);
      setBypassGains(dry, wet, slot.status === "ready");
      this.inspect.mode = slot.status === "ready" ? "process" : "bypass";
    },
    dispose() {
      for (const node of [input, output, dry, wet, comp, makeup]) {
        disconnectQuiet(node);
      }
    },
  };
}

function buildLimiterSlot(ctx: StudioFxGraphContext, effect: StudioFxInstance): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  const ceiling = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  input.connect(comp);
  comp.connect(ceiling);
  ceiling.connect(wet);
  wet.connect(output);
  applyLimiter(comp, ceiling, effect.params as StudioFxLimiterParams);
  setBypassGains(dry, wet, effect.enabled);
  return {
    input,
    output,
    inspect: {
      type: "limiter",
      id: effect.id,
      mode: effect.enabled ? "process" : "bypass",
      nodes: ["gain", "dynamics-compressor", "gain-ceiling"],
    },
    apply(slot) {
      if (slot.status === "skip") {
        setBypassGains(dry, wet, false);
        this.inspect.mode = "bypass";
        return;
      }
      applyLimiter(comp, ceiling, slot.effect.params as StudioFxLimiterParams);
      setBypassGains(dry, wet, slot.status === "ready");
      this.inspect.mode = slot.status === "ready" ? "process" : "bypass";
    },
    dispose() {
      for (const node of [input, output, dry, wet, comp, ceiling]) {
        disconnectQuiet(node);
      }
    },
  };
}

function buildReverbSlot(ctx: StudioFxGraphContext, effect: StudioFxInstance): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.normalize = true;
  const params = effect.params as StudioFxReverbParams;
  convolver.buffer = createImpulse(ctx, params.decaySeconds);
  input.connect(dry);
  dry.connect(output);
  input.connect(convolver);
  convolver.connect(wet);
  wet.connect(output);
  const mix = effect.enabled ? params.mix : 0;
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;
  let lastDecay = params.decaySeconds;
  return {
    input,
    output,
    inspect: {
      type: "reverb",
      id: effect.id,
      mode: effect.enabled ? "process" : "bypass",
      nodes: ["gain", "convolver", "gain-wet"],
    },
    apply(slot) {
      if (slot.status === "skip" || slot.status === "bypass") {
        dry.gain.value = 1;
        wet.gain.value = 0;
        this.inspect.mode = "bypass";
        return;
      }
      const next = slot.effect.params as StudioFxReverbParams;
      if (next.decaySeconds !== lastDecay) {
        convolver.buffer = createImpulse(ctx, next.decaySeconds);
        lastDecay = next.decaySeconds;
      }
      dry.gain.value = 1 - next.mix;
      wet.gain.value = next.mix;
      this.inspect.mode = "process";
    },
    dispose() {
      for (const node of [input, output, dry, wet, convolver]) {
        disconnectQuiet(node);
      }
    },
  };
}

function buildDelaySlot(ctx: StudioFxGraphContext, effect: StudioFxInstance): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  input.connect(dry);
  dry.connect(output);
  input.connect(delay);
  delay.connect(wet);
  wet.connect(output);
  delay.connect(feedback);
  feedback.connect(delay);
  const params = effect.params as StudioFxDelayParams;
  delay.delayTime.value = params.timeMs / 1000;
  feedback.gain.value = effect.enabled ? params.feedback : 0;
  const mix = effect.enabled ? params.mix : 0;
  dry.gain.value = 1 - mix;
  wet.gain.value = mix;
  return {
    input,
    output,
    inspect: {
      type: "delay",
      id: effect.id,
      mode: effect.enabled ? "process" : "bypass",
      nodes: ["gain", "delay", "gain-feedback", "gain-wet"],
    },
    apply(slot) {
      if (slot.status === "skip" || slot.status === "bypass") {
        dry.gain.value = 1;
        wet.gain.value = 0;
        feedback.gain.value = 0;
        this.inspect.mode = "bypass";
        return;
      }
      const next = slot.effect.params as StudioFxDelayParams;
      delay.delayTime.value = next.timeMs / 1000;
      feedback.gain.value = next.feedback;
      dry.gain.value = 1 - next.mix;
      wet.gain.value = next.mix;
      this.inspect.mode = "process";
    },
    dispose() {
      for (const node of [input, output, dry, wet, delay, feedback]) {
        disconnectQuiet(node);
      }
    },
  };
}

function buildWireSlot(ctx: StudioFxGraphContext, slot: StudioFxPlaybackSlot): BuiltSlot {
  const input = ctx.createGain();
  const output = ctx.createGain();
  input.connect(output);
  const type =
    slot.status === "skip" ? "unknown" : slot.effect.type;
  const id = slot.status === "skip" ? null : slot.effect.id;
  return {
    input,
    output,
    inspect: { type, id, mode: "bypass", nodes: ["gain-wire"] },
    apply() {
      this.inspect.mode = "bypass";
    },
    dispose() {
      disconnectQuiet(input);
      disconnectQuiet(output);
    },
  };
}

function tryBuildProcessSlot(
  ctx: StudioFxGraphContext,
  effect: StudioFxInstance,
): BuiltSlot {
  if (effect.type === "eq") return buildEqSlot(ctx, effect);
  if (effect.type === "compressor") return buildCompressorSlot(ctx, effect);
  if (effect.type === "limiter") return buildLimiterSlot(ctx, effect);
  if (effect.type === "reverb") return buildReverbSlot(ctx, effect);
  return buildDelaySlot(ctx, effect);
}

function structureKey(plan: StudioFxPlaybackPlan): string {
  if (plan.kind === "unsupported") return "unsupported";
  return plan.slots
    .map((slot) => {
      if (slot.status === "skip") return `skip:${slot.code}`;
      return `${slot.effect.id}:${slot.effect.type}`;
    })
    .join("|");
}

/**
 * Builds a series FX insert (Track or Master). Same adapters for both roles.
 * Empty / unsupported → null (caller wires dry: input → next node).
 */
export function buildStudioTrackFxChain(
  ctx: StudioFxGraphContext,
  rawChain: unknown,
  onDiagnostic: (code: StudioAudioErrorCode) => void,
): StudioTrackFxHandle | null {
  const plan = interpretStudioFxChainForPlayback(rawChain);
  if (plan.kind === "unsupported") {
    onDiagnostic("AUDIO_FX_CHAIN_UNSUPPORTED");
    return null;
  }
  if (plan.slots.length === 0) return null;

  const input = ctx.createGain();
  const output = ctx.createGain();
  const built: BuiltSlot[] = [];
  let prev: StudioFxConnectable = input;

  for (const slot of plan.slots) {
    if (slot.status === "skip") {
      onDiagnostic(slot.code);
    }
    let next: BuiltSlot;
    try {
      if (slot.status === "ready") {
        next = tryBuildProcessSlot(ctx, slot.effect);
      } else if (slot.status === "bypass") {
        next = tryBuildProcessSlot(ctx, slot.effect);
        next.apply(slot);
      } else {
        next = buildWireSlot(ctx, slot);
      }
    } catch {
      onDiagnostic("AUDIO_FX_NODE_FAILED");
      next = buildWireSlot(ctx, {
        status: "skip",
        code: "AUDIO_FX_INVALID_PARAMS",
      });
    }
    prev.connect(next.input);
    built.push(next);
    prev = next.output;
  }
  prev.connect(output);

  const handle: StudioTrackFxHandle = {
    input,
    output,
    fingerprint: studioFxPlaybackFingerprint(plan),
    inspect() {
      return built.map((slot) => ({ ...slot.inspect }));
    },
    applyPlan(nextPlan) {
      if (structureKey(nextPlan) !== structureKey(plan)) return false;
      if (nextPlan.kind === "unsupported") return false;
      for (let i = 0; i < built.length; i += 1) {
        const slot = nextPlan.slots[i];
        if (!slot) return false;
        built[i].apply(slot);
      }
      handle.fingerprint = studioFxPlaybackFingerprint(nextPlan);
      return true;
    },
    dispose() {
      for (const slot of built) slot.dispose();
      disconnectQuiet(input);
      disconnectQuiet(output);
    },
  };
  return handle;
}

/** P6.3 — Master FX uses the same factory as Track FX (REUSE FIRST). */
export const buildStudioMasterFxChain = buildStudioTrackFxChain;
