/**
 * E3.3 — Client-side realtime Mix preview graph (Web Audio).
 * Durable artifacts / Master / Render are out of scope.
 */

import {
  describeMixGraphStages,
  type MixParameters,
  type MixProParams,
} from "@/lib/mix/params";

export { describeMixGraphStages };

function dbToGain(gainDb: number): number {
  return Math.pow(10, gainDb / 20);
}

function connectChain(nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i]!.connect(nodes[i + 1]!);
  }
  return nodes[nodes.length - 1]!;
}

function buildBasicEq(ctx: AudioContext, eq: MixParameters["eq"]): BiquadFilterNode[] {
  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 120;
  low.gain.value = eq.lowGainDb;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.9;
  mid.gain.value = eq.midGainDb;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 8000;
  high.gain.value = eq.highGainDb;

  return [low, mid, high];
}

function buildCompressor(
  ctx: AudioContext,
  c: MixParameters["compressor"],
): DynamicsCompressorNode {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = c.thresholdDb;
  node.ratio.value = c.ratio;
  node.attack.value = c.attackMs / 1000;
  node.release.value = c.releaseMs / 1000;
  node.knee.value = 6;
  return node;
}

function buildLimiter(
  ctx: AudioContext,
  l: MixParameters["limiter"],
): DynamicsCompressorNode {
  const node = ctx.createDynamicsCompressor();
  node.threshold.value = l.thresholdDb;
  node.ratio.value = 20;
  node.attack.value = 0.001;
  node.release.value = 0.05;
  node.knee.value = 0;
  return node;
}

function buildDelay(
  ctx: AudioContext,
  d: MixParameters["delay"],
): { input: GainNode; output: GainNode } {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const delay = ctx.createDelay(2);
  const feedback = ctx.createGain();
  const output = ctx.createGain();

  dry.gain.value = 1 - d.mix;
  wet.gain.value = d.mix;
  delay.delayTime.value = d.timeMs / 1000;
  feedback.gain.value = d.feedback;

  input.connect(dry);
  input.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);
  delay.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return { input, output };
}

function buildReverb(
  ctx: AudioContext,
  r: MixParameters["reverb"],
): { input: GainNode; output: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const convolver = ctx.createConvolver();
  const output = ctx.createGain();

  dry.gain.value = 1 - r.mix;
  wet.gain.value = r.mix;

  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * r.decaySeconds));
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  convolver.buffer = impulse;

  input.connect(dry);
  input.connect(convolver);
  convolver.connect(wet);
  dry.connect(output);
  wet.connect(output);

  return {
    input,
    output,
    dispose: () => {
      convolver.disconnect();
    },
  };
}

function buildProTakeChain(
  ctx: AudioContext,
  pro: MixProParams,
): { input: GainNode; output: GainNode; dispose: () => void } {
  const input = ctx.createGain();
  const nodes: AudioNode[] = [input];

  for (const band of pro.eqBands) {
    const f = ctx.createBiquadFilter();
    f.type = "peaking";
    f.frequency.value = band.frequencyHz;
    f.Q.value = band.q;
    f.gain.value = band.gainDb;
    nodes.push(f);
  }

  // Multiband approximation: three parallel compressors via filters (preview-class).
  const splitLow = ctx.createBiquadFilter();
  splitLow.type = "lowpass";
  splitLow.frequency.value = 250;
  const splitHigh = ctx.createBiquadFilter();
  splitHigh.type = "highpass";
  splitHigh.frequency.value = 2500;
  const midBp = ctx.createBiquadFilter();
  midBp.type = "bandpass";
  midBp.frequency.value = 1000;
  midBp.Q.value = 0.5;

  const last = nodes[nodes.length - 1]!;
  const lowC = buildCompressor(ctx, {
    thresholdDb: pro.multiband.low.thresholdDb,
    ratio: pro.multiband.low.ratio,
    attackMs: 10,
    releaseMs: 80,
  });
  const midC = buildCompressor(ctx, {
    thresholdDb: pro.multiband.mid.thresholdDb,
    ratio: pro.multiband.mid.ratio,
    attackMs: 8,
    releaseMs: 90,
  });
  const highC = buildCompressor(ctx, {
    thresholdDb: pro.multiband.high.thresholdDb,
    ratio: pro.multiband.high.ratio,
    attackMs: 5,
    releaseMs: 70,
  });
  const lowMake = ctx.createGain();
  lowMake.gain.value = dbToGain(pro.multiband.low.makeupDb);
  const midMake = ctx.createGain();
  midMake.gain.value = dbToGain(pro.multiband.mid.makeupDb);
  const highMake = ctx.createGain();
  highMake.gain.value = dbToGain(pro.multiband.high.makeupDb);
  const mbMerge = ctx.createGain();

  last.connect(splitLow);
  last.connect(midBp);
  last.connect(splitHigh);
  splitLow.connect(lowC).connect(lowMake).connect(mbMerge);
  midBp.connect(midC).connect(midMake).connect(mbMerge);
  splitHigh.connect(highC).connect(highMake).connect(mbMerge);

  const deEsser = ctx.createBiquadFilter();
  deEsser.type = "peaking";
  deEsser.frequency.value = pro.deEsser.frequencyHz;
  deEsser.Q.value = 2;
  deEsser.gain.value = -Math.min(pro.deEsser.rangeDb, 12);
  mbMerge.connect(deEsser);

  let tip: AudioNode = deEsser;
  for (const fx of pro.fxChain) {
    if (fx.type === "filter") {
      const f = ctx.createBiquadFilter();
      f.type = "peaking";
      f.frequency.value = fx.frequencyHz;
      f.Q.value = fx.q;
      f.gain.value = fx.gainDb;
      tip.connect(f);
      tip = f;
    } else {
      // Chorus approx: delayed wet blend
      const delay = ctx.createDelay(0.05);
      delay.delayTime.value = 0.02;
      const wet = ctx.createGain();
      wet.gain.value = fx.mix * fx.depth;
      const dry = ctx.createGain();
      dry.gain.value = 1 - fx.mix;
      const merge = ctx.createGain();
      tip.connect(dry);
      tip.connect(delay);
      delay.connect(wet);
      dry.connect(merge);
      wet.connect(merge);
      tip = merge;
    }
  }

  connectChain(nodes);
  const output = ctx.createGain();
  tip.connect(output);

  return {
    input,
    output,
    dispose: () => {
      /* nodes GC after disconnect in disposeAll */
    },
  };
}

export type MixGraphHandles = {
  ctx: AudioContext;
  beatEl: HTMLAudioElement;
  takeEl: HTMLAudioElement;
  applyParameters: (params: MixParameters) => void;
  play: () => Promise<void>;
  stop: () => void;
  dispose: () => void;
  stages: string[];
};

/**
 * Build a Mix preview graph from two media elements (signed URLs already set).
 * Call only from browser after a user gesture when starting AudioContext.
 */
export function createMixPreviewGraph(params: {
  beatEl: HTMLAudioElement;
  takeEl: HTMLAudioElement;
  parameters: MixParameters;
  AudioContextCtor?: typeof AudioContext;
}): MixGraphHandles {
  const Ctor = params.AudioContextCtor ?? window.AudioContext;
  const ctx = new Ctor();
  const stages = describeMixGraphStages(params.parameters);

  const beatSource = ctx.createMediaElementSource(params.beatEl);
  const takeSource = ctx.createMediaElementSource(params.takeEl);

  const beatGain = ctx.createGain();
  const beatPan = ctx.createStereoPanner();
  const takeGain = ctx.createGain();
  const takePan = ctx.createStereoPanner();
  const masterBus = ctx.createGain();

  let disposable: Array<() => void> = [];
  let takeInput: AudioNode = takePan;
  let takeOutput: AudioNode = takePan;

  function rebuildTakeFx(p: MixParameters) {
    for (const d of disposable) d();
    disposable = [];

    const chain: AudioNode[] = [];
    let head: AudioNode = takePan;

    if (p.pro) {
      const pro = buildProTakeChain(ctx, p.pro);
      head.connect(pro.input);
      head = pro.output;
      disposable.push(pro.dispose);
    }

    const eq = buildBasicEq(ctx, p.eq);
    head.connect(eq[0]!);
    connectChain(eq);
    head = eq[eq.length - 1]!;

    const comp = buildCompressor(ctx, p.compressor);
    head.connect(comp);
    head = comp;

    const delay = buildDelay(ctx, p.delay);
    head.connect(delay.input);
    head = delay.output;

    const reverb = buildReverb(ctx, p.reverb);
    head.connect(reverb.input);
    head = reverb.output;
    disposable.push(reverb.dispose);

    head.connect(masterBus);
    takeInput = takePan;
    takeOutput = head;
    void takeInput;
    void takeOutput;
    void chain;
  }

  const limiter = buildLimiter(ctx, params.parameters.limiter);
  masterBus.connect(limiter);
  limiter.connect(ctx.destination);

  beatSource.connect(beatGain);
  beatGain.connect(beatPan);
  beatPan.connect(masterBus);

  takeSource.connect(takeGain);
  takeGain.connect(takePan);

  function applyParameters(p: MixParameters) {
    beatGain.gain.value = dbToGain(p.beat.gainDb);
    beatPan.pan.value = p.beat.pan;
    takeGain.gain.value = dbToGain(p.take.gainDb);
    takePan.pan.value = p.take.pan;
    limiter.threshold.value = p.limiter.thresholdDb;
    rebuildTakeFx(p);
  }

  applyParameters(params.parameters);

  let disposed = false;

  return {
    ctx,
    beatEl: params.beatEl,
    takeEl: params.takeEl,
    stages,
    applyParameters,
    async play() {
      if (disposed) return;
      if (ctx.state === "suspended") await ctx.resume();
      params.beatEl.currentTime = 0;
      params.takeEl.currentTime = 0;
      await Promise.all([params.beatEl.play(), params.takeEl.play()]);
    },
    stop() {
      params.beatEl.pause();
      params.takeEl.pause();
      params.beatEl.currentTime = 0;
      params.takeEl.currentTime = 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      this.stop();
      for (const d of disposable) d();
      disposable = [];
      void ctx.close();
    },
  };
}
