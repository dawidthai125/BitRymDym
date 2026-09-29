import { describe, expect, it } from "vitest";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  SERVER_PRO_BAKE_ENGINE,
  SERVER_PRO_TARGET_SAMPLE_RATE,
  applyProTakeChain,
  bakeServerProV1Mix,
} from "@/lib/audio/server-pro-bake";
import {
  defaultMixParameters,
  defaultMixProParams,
} from "@/lib/mix/params";

function synthStereo(params: {
  sampleRate: number;
  frames: number;
  freqL: number;
  freqR: number;
  amp?: number;
}) {
  const amp = params.amp ?? 0.25;
  const interleaved = new Float32Array(params.frames * 2);
  for (let i = 0; i < params.frames; i++) {
    const t = i / params.sampleRate;
    interleaved[i * 2] = Math.sin(2 * Math.PI * params.freqL * t) * amp;
    interleaved[i * 2 + 1] = Math.sin(2 * Math.PI * params.freqR * t) * amp;
  }
  return {
    sampleRate: params.sampleRate,
    channels: 2 as const,
    interleaved,
    frames: params.frames,
  };
}

function rms(interleaved: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < interleaved.length; i++) {
    const s = interleaved[i] ?? 0;
    sum += s * s;
  }
  return Math.sqrt(sum / Math.max(1, interleaved.length));
}

describe("E3.7-A — server-pro-v1 Pro Mix", () => {
  it("rejects missing parameters.pro (no Basic fallback)", () => {
    const take = synthStereo({
      sampleRate: 44100,
      frames: 4410,
      freqL: 440,
      freqR: 440,
    });
    const beat = synthStereo({
      sampleRate: 44100,
      frames: 4410,
      freqL: 220,
      freqR: 220,
    });
    const parameters = defaultMixParameters();
    parameters.pro = null;
    expect(() =>
      bakeServerProV1Mix({ take, beat, parameters }),
    ).toThrow(RenderJobDomainError);
    try {
      bakeServerProV1Mix({ take, beat, parameters });
    } catch (e) {
      expect(e).toBeInstanceOf(RenderJobDomainError);
      expect((e as RenderJobDomainError).code).toBe("INVALID");
      expect(String(e)).toMatch(/parameters\.pro/);
    }
  });

  it("bakes Pro Mix to 44.1 kHz stereo with engine server-pro-v1", () => {
    const take = synthStereo({
      sampleRate: 48000,
      frames: 4800,
      freqL: 880,
      freqR: 880,
    });
    const beat = synthStereo({
      sampleRate: 48000,
      frames: 4800,
      freqL: 110,
      freqR: 110,
    });
    const parameters = defaultMixParameters();
    parameters.pro = defaultMixProParams();
    const baked = bakeServerProV1Mix({ take, beat, parameters });
    expect(baked.engineId).toBe(SERVER_PRO_BAKE_ENGINE);
    expect(baked.sampleRate).toBe(SERVER_PRO_TARGET_SAMPLE_RATE);
    expect(baked.channels).toBe(2);
    expect(baked.frames).toBeGreaterThan(100);
    expect(baked.durationMs).toBeGreaterThan(0);
    expect(baked.masterApplied).toBe(false);
    expect(baked.interleaved.length).toBe(baked.frames * 2);
    expect(Number.isFinite(baked.interleaved[0])).toBe(true);
  });

  it("Pro EQ gain changes take-chain energy vs unity pro defaults", () => {
    const take = synthStereo({
      sampleRate: 44100,
      frames: 8820,
      freqL: 1000,
      freqR: 1000,
      amp: 0.3,
    });
    const beat = synthStereo({
      sampleRate: 44100,
      frames: 8820,
      freqL: 80,
      freqR: 80,
      amp: 0.05,
    });

    const flat = defaultMixParameters();
    flat.pro = defaultMixProParams();
    const boosted = defaultMixParameters();
    boosted.pro = defaultMixProParams();
    boosted.pro.eqBands = boosted.pro.eqBands.map((b) =>
      Math.abs(b.frequencyHz - 1000) < 1
        ? { ...b, gainDb: 12 }
        : b,
    );

    const a = bakeServerProV1Mix({ take, beat, parameters: flat });
    const b = bakeServerProV1Mix({
      take: {
        ...take,
        interleaved: new Float32Array(take.interleaved),
      },
      beat: {
        ...beat,
        interleaved: new Float32Array(beat.interleaved),
      },
      parameters: boosted,
    });
    expect(rms(b.interleaved)).toBeGreaterThan(rms(a.interleaved) * 1.05);
  });

  it("applyProTakeChain is deterministic for identical inputs", () => {
    const a = synthStereo({
      sampleRate: 44100,
      frames: 2048,
      freqL: 6500,
      freqR: 6500,
    });
    const b = {
      ...a,
      interleaved: new Float32Array(a.interleaved),
    };
    const pro = defaultMixProParams();
    applyProTakeChain(a.interleaved, a.frames, a.sampleRate, pro);
    applyProTakeChain(b.interleaved, b.frames, b.sampleRate, pro);
    for (let i = 0; i < a.interleaved.length; i++) {
      expect(a.interleaved[i]).toBe(b.interleaved[i]);
    }
  });
});
