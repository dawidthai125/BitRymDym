import { describe, expect, it } from "vitest";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  SERVER_PRO_BAKE_ENGINE,
  bakeServerProV1,
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
  const amp = params.amp ?? 0.4;
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

function peakAbs(interleaved: Float32Array): number {
  let m = 0;
  for (let i = 0; i < interleaved.length; i++) {
    m = Math.max(m, Math.abs(interleaved[i] ?? 0));
  }
  return m;
}

describe("E3.7-B — server-pro-v1 Master Plan A", () => {
  it("applies Plan A master after Pro Mix (masterApplied=true)", () => {
    const take = synthStereo({
      sampleRate: 44100,
      frames: 4410,
      freqL: 440,
      freqR: 440,
    });
    const beat = synthStereo({
      sampleRate: 44100,
      frames: 4410,
      freqL: 110,
      freqR: 110,
      amp: 0.1,
    });
    const parameters = defaultMixParameters();
    parameters.pro = defaultMixProParams();
    const baked = bakeServerProV1({ take, beat, parameters });
    expect(baked.engineId).toBe(SERVER_PRO_BAKE_ENGINE);
    expect(baked.masterApplied).toBe(true);
    expect(baked.sampleRate).toBe(44100);
    expect(baked.channels).toBe(2);
    expect(peakAbs(baked.interleaved)).toBeLessThanOrEqual(1.0001);
  });

  it("master gainDb changes output level vs mix-only path", () => {
    const take = synthStereo({
      sampleRate: 44100,
      frames: 8820,
      freqL: 500,
      freqR: 500,
      amp: 0.2,
    });
    const beat = synthStereo({
      sampleRate: 44100,
      frames: 8820,
      freqL: 90,
      freqR: 90,
      amp: 0.05,
    });
    const base = defaultMixParameters();
    base.pro = defaultMixProParams();
    const hot = defaultMixParameters();
    hot.pro = defaultMixProParams();
    hot.master = {
      ...hot.master,
      gainDb: 6,
      clipProtect: true,
    };

    const mixOnly = bakeServerProV1Mix({ take, beat, parameters: base });
    const mastered = bakeServerProV1({
      take: { ...take, interleaved: new Float32Array(take.interleaved) },
      beat: { ...beat, interleaved: new Float32Array(beat.interleaved) },
      parameters: hot,
      applyLoudnessMakeup: false,
    });
    expect(mastered.masterApplied).toBe(true);
    expect(mixOnly.masterApplied).toBe(false);
    expect(peakAbs(mastered.interleaved)).not.toBe(peakAbs(mixOnly.interleaved));
  });

  it("invalid master → FAIL (no Basic fallback)", () => {
    const take = synthStereo({
      sampleRate: 44100,
      frames: 1024,
      freqL: 200,
      freqR: 200,
    });
    const beat = synthStereo({
      sampleRate: 44100,
      frames: 1024,
      freqL: 100,
      freqR: 100,
    });
    const parameters = defaultMixParameters();
    parameters.pro = defaultMixProParams();
    // Force invalid master nest
    (parameters as { master: unknown }).master = { gainDb: "bad" };
    expect(() => bakeServerProV1({ take, beat, parameters })).toThrow(
      RenderJobDomainError,
    );
  });
});
