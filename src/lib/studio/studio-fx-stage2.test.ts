/**
 * Stage 2 — new FX types (highpass / deesser / gate): contract, live graph
 * wiring and offline (E3 render) DSP on synthetic PCM.
 */

import { describe, expect, it } from "vitest";

import {
  createStudioFxInstance,
  parseStudioFxChainForWrite,
  STUDIO_FX_UI_META,
  type StudioFxInstance,
} from "@/lib/studio/studio-fx-chain";
import { buildStudioTrackFxChain } from "@/lib/studio/studio-fx-graph";
import {
  buildGateGainCurve,
  gateGainForEnvelope,
  linearQToWebAudioDb,
} from "@/lib/studio/studio-fx-stage2-dsp";
import {
  buildStudioOfflineFxChain,
  createDeesserProcessorAtRate,
  createGateProcessorAtRate,
  createHighpassProcessorAtRate,
  type StudioOfflineFxProcessor,
} from "@/lib/studio/studio-offline-fx";
import { computeBiquadCoeffs } from "@/lib/studio/studio-offline-fx-biquad";

const SR = 48000;
const ID = "3fa85f64-5717-4562-b3fc-2c963f66afb1";

function sineRms(
  proc: StudioOfflineFxProcessor,
  freq: number,
  amp: number,
  seconds = 0.5,
): number {
  const n = Math.floor(SR * seconds);
  let acc = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const x = amp * Math.sin((2 * Math.PI * freq * i) / SR);
    const y = proc.process({ left: x, right: x });
    if (i > n / 2) {
      acc += y.left * y.left;
      count++;
    }
  }
  return Math.sqrt(acc / count);
}

function db(x: number): number {
  return 20 * Math.log10(x);
}

function inst<T extends "highpass" | "deesser" | "gate">(
  type: T,
  params?: Partial<Extract<StudioFxInstance, { type: T }>["params"]>,
): Extract<StudioFxInstance, { type: T }> {
  const base = createStudioFxInstance(type, () => ID) as Extract<
    StudioFxInstance,
    { type: T }
  >;
  return { ...base, params: { ...base.params, ...params } };
}

describe("stage 2 FX contract", () => {
  it("parses new types with defaults and ranges; rejects out-of-range", () => {
    const chain = parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [
          { id: ID, type: "highpass", enabled: true, params: { frequencyHz: 100 } },
          {
            id: "3fa85f64-5717-4562-b3fc-2c963f66afb2",
            type: "deesser",
            enabled: true,
          },
          {
            id: "3fa85f64-5717-4562-b3fc-2c963f66afb3",
            type: "gate",
            enabled: false,
            params: { thresholdDb: -60, rangeDb: 10, releaseMs: 120 },
          },
        ],
      },
      { role: "track" },
    );
    expect(chain.effects.map((e) => e.type)).toEqual(["highpass", "deesser", "gate"]);
    expect(chain.effects[0]?.params).toEqual({ frequencyHz: 100, q: 0.707 });
    expect(chain.effects[1]?.params).toEqual({
      frequencyHz: 6500,
      thresholdDb: -30,
      ratio: 4,
    });
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [{ id: ID, type: "highpass", enabled: true, params: { frequencyHz: 5 } }],
        },
        { role: "track" },
      ),
    ).toThrow();
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [{ id: ID, type: "gate", enabled: true, params: { foo: 1 } }],
        },
        { role: "track" },
      ),
    ).toThrow();
  });

  it("has UI meta (PL labels) for each new type", () => {
    expect(STUDIO_FX_UI_META.highpass.labelPl).toBe("Filtr górnoprzepustowy");
    expect(STUDIO_FX_UI_META.deesser.params.map((p) => p.path)).toEqual([
      "frequencyHz",
      "thresholdDb",
      "ratio",
    ]);
    expect(STUDIO_FX_UI_META.gate.params).toHaveLength(3);
  });
});

describe("stage 2 offline DSP (E3 render path)", () => {
  it("lowpass/highpass cookbook coefficients: unity in passband", () => {
    const lp = computeBiquadCoeffs("lowpass", SR, 1000, 0, Math.SQRT1_2);
    const dc = (lp.b0 + lp.b1 + lp.b2) / (1 + lp.a1 + lp.a2);
    expect(dc).toBeCloseTo(1, 6);
    const hp = computeBiquadCoeffs("highpass", SR, 1000, 0, Math.SQRT1_2);
    const nyq = (hp.b0 - hp.b1 + hp.b2) / (1 - hp.a1 + hp.a2);
    expect(nyq).toBeCloseTo(1, 6);
  });

  it("highpass cuts rumble and keeps the vocal band", () => {
    const low = sineRms(createHighpassProcessorAtRate(inst("highpass", { frequencyHz: 100 }), SR), 30, 0.5);
    const mid = sineRms(createHighpassProcessorAtRate(inst("highpass", { frequencyHz: 100 }), SR), 2000, 0.5);
    expect(db(low / (0.5 / Math.SQRT2))).toBeLessThan(-15);
    expect(db(mid / (0.5 / Math.SQRT2))).toBeGreaterThan(-0.5);
  });

  it("deesser reduces loud sibilance, leaves mids untouched", () => {
    const p = { frequencyHz: 6000, thresholdDb: -30, ratio: 6 };
    const ref = 0.5 / Math.SQRT2;
    const ess = sineRms(createDeesserProcessorAtRate(inst("deesser", p), SR), 8000, 0.5);
    const mid = sineRms(createDeesserProcessorAtRate(inst("deesser", p), SR), 800, 0.5);
    expect(db(ess / ref)).toBeLessThan(-6);
    expect(Math.abs(db(mid / ref))).toBeLessThan(0.5);
  });

  it("deesser is transparent below threshold (LR4 sums flat)", () => {
    const p = { frequencyHz: 6000, thresholdDb: 0, ratio: 6 };
    for (const f of [200, 6000, 9000]) {
      const out = sineRms(createDeesserProcessorAtRate(inst("deesser", p), SR), f, 0.1);
      expect(Math.abs(db(out / (0.1 / Math.SQRT2)))).toBeLessThan(0.3);
    }
  });

  it("gate: loud passes, quiet floor attenuated at most by rangeDb", () => {
    const p = { thresholdDb: -50, rangeDb: 12, releaseMs: 100 };
    const loud = sineRms(createGateProcessorAtRate(inst("gate", p), SR), 440, 0.3);
    expect(Math.abs(db(loud / (0.3 / Math.SQRT2)))).toBeLessThan(0.1);
    const quietAmp = 10 ** (-75 / 20);
    const quiet = sineRms(createGateProcessorAtRate(inst("gate", p), SR), 440, quietAmp);
    const cut = db(quiet / (quietAmp / Math.SQRT2));
    expect(cut).toBeLessThan(-11);
    expect(cut).toBeGreaterThan(-12.5);
  });

  it("gate curve: 1:2 expansion below threshold, capped by range", () => {
    const p = { thresholdDb: -40, rangeDb: 20, releaseMs: 150 };
    expect(gateGainForEnvelope(0.5, p)).toBe(1);
    expect(db(gateGainForEnvelope(10 ** (-45 / 20), p))).toBeCloseTo(-5, 5);
    expect(db(gateGainForEnvelope(1e-6, p))).toBeCloseTo(-20, 5);
    const curve = buildGateGainCurve(p, 1025);
    expect(curve[curve.length - 1]).toBe(1);
    expect(curve[512]).toBeCloseTo(0.1, 5);
  });

  it("chain build: new types are IMPLEMENTED, disabled = bypass wire", () => {
    const chain = buildStudioOfflineFxChain(
      {
        schemaVersion: 1,
        effects: [
          { id: ID, type: "highpass", enabled: true, params: { frequencyHz: 90, q: 0.707 } },
          {
            id: "3fa85f64-5717-4562-b3fc-2c963f66afb2",
            type: "gate",
            enabled: false,
            params: { thresholdDb: -55, rangeDb: 12, releaseMs: 150 },
          },
        ],
      },
      "track",
      SR,
    );
    expect(chain?.processors.map((p) => `${p.type}:${p.status}`)).toEqual([
      "highpass:IMPLEMENTED",
      "gate:BYPASS",
    ]);
  });
});

type Node = {
  kind: string;
  connections: unknown[];
  gain: { value: number };
  type: string;
  frequency: { value: number };
  Q: { value: number };
  threshold: { value: number };
  ratio: { value: number };
  attack: { value: number };
  release: { value: number };
  knee: { value: number };
  delayTime: { value: number };
  buffer: unknown;
  normalize: boolean;
  curve: Float32Array | null;
  connect(dest: unknown): unknown;
  disconnect(): void;
};

function fakeCtx(withShaper: boolean) {
  const nodes: Node[] = [];
  const make = (kind: string): Node => {
    const n: Node = {
      kind,
      connections: [],
      gain: { value: 1 },
      type: "peaking",
      frequency: { value: 0 },
      Q: { value: 0 },
      threshold: { value: 0 },
      ratio: { value: 0 },
      attack: { value: 0 },
      release: { value: 0 },
      knee: { value: 0 },
      delayTime: { value: 0 },
      buffer: null,
      normalize: true,
      curve: null,
      connect(dest) {
        n.connections.push(dest);
        return dest;
      },
      disconnect() {
        n.connections = [];
      },
    };
    nodes.push(n);
    return n;
  };
  const ctx = {
    sampleRate: SR,
    createGain: () => make("gain"),
    createBiquadFilter: () => make("biquad"),
    createDynamicsCompressor: () => make("dyn"),
    createDelay: () => make("delay"),
    createConvolver: () => make("conv"),
    createBuffer: () => ({
      numberOfChannels: 2,
      length: 1,
      sampleRate: SR,
      getChannelData: () => new Float32Array(1),
    }),
    ...(withShaper ? { createWaveShaper: () => make("shaper") } : {}),
  };
  return { ctx, nodes };
}

function chainOf(type: "highpass" | "deesser" | "gate", enabled = true) {
  const e = createStudioFxInstance(type, () => ID);
  return { schemaVersion: 1, effects: [{ ...e, enabled }] };
}

describe("stage 2 live Web Audio graph", () => {
  it("highpass: biquad type + Q converted to dB", () => {
    const { ctx, nodes } = fakeCtx(true);
    const h = buildStudioTrackFxChain(ctx, chainOf("highpass"), () => {});
    expect(h?.inspect()[0]?.nodes).toEqual(["gain", "biquad-highpass"]);
    const bq = nodes.find((n) => n.kind === "biquad");
    expect(bq?.type).toBe("highpass");
    expect(bq?.frequency.value).toBe(90);
    expect(bq?.Q.value).toBeCloseTo(linearQToWebAudioDb(0.707), 6);
  });

  it("deesser: LR4 crossover + fast compressor on the high band", () => {
    const { ctx, nodes } = fakeCtx(true);
    const h = buildStudioTrackFxChain(ctx, chainOf("deesser"), () => {});
    expect(h?.inspect()[0]?.nodes).toContain("dynamics-compressor");
    const bqs = nodes.filter((n) => n.kind === "biquad");
    expect(bqs.map((b) => b.type).sort()).toEqual(["highpass", "highpass", "lowpass", "lowpass"]);
    expect(bqs.every((b) => b.frequency.value === 6500)).toBe(true);
    const dyn = nodes.find((n) => n.kind === "dyn");
    expect(dyn?.attack.value).toBe(0.001);
    expect(dyn?.ratio.value).toBe(4);
  });

  it("gate: envelope → curve → VCA gain param; falls back to wire without WaveShaper", () => {
    const { ctx, nodes } = fakeCtx(true);
    const h = buildStudioTrackFxChain(ctx, chainOf("gate"), () => {});
    expect(h?.inspect()[0]?.nodes).toEqual([
      "gain",
      "waveshaper-abs",
      "biquad-lowpass",
      "waveshaper-gate",
      "gain-vca",
    ]);
    const shapers = nodes.filter((n) => n.kind === "shaper");
    expect(shapers).toHaveLength(2);
    const vca = nodes.filter((n) => n.kind === "gain").find((n) => n.gain.value === 0 && shapers[1]?.connections.includes(n.gain));
    expect(vca).toBeDefined();
    const noShaper = fakeCtx(false);
    const h2 = buildStudioTrackFxChain(noShaper.ctx, chainOf("gate"), () => {});
    expect(h2?.inspect()[0]?.nodes).toEqual(["gain-wire"]);
  });

  it("disabled stage 2 effect → bypass (dry=1, wet=0)", () => {
    const { ctx } = fakeCtx(true);
    const h = buildStudioTrackFxChain(ctx, chainOf("deesser", false), () => {});
    expect(h?.inspect()[0]?.mode).toBe("bypass");
  });
});
