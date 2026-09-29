import { describe, expect, it } from "vitest";

import {
  decodeRenderSourceToStereoPcm,
  renderDecodeErrorCode,
} from "@/lib/audio/render-decode";
import {
  SERVER_BASIC_BAKE_ENGINE,
  SERVER_BASIC_TARGET_SAMPLE_RATE,
  bakeServerBasicV1,
  resampleStereoInterleaved,
} from "@/lib/audio/server-basic-bake";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { defaultMixParameters } from "@/lib/mix/params";

function synthStereo(params: {
  sampleRate: number;
  frames: number;
  freqL: number;
  freqR: number;
  amp?: number;
}) {
  const amp = params.amp ?? 0.2;
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

function minimalWavPcm16Mono(sampleRate = 44100, seconds = 0.05): Buffer {
  const n = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(44 + n * 2);
  data.write("RIFF", 0);
  data.writeUInt32LE(36 + n * 2, 4);
  data.write("WAVE", 8);
  data.write("fmt ", 12);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(sampleRate, 24);
  data.writeUInt32LE(sampleRate * 2, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.floor(s * 16000))), 44 + i * 2);
  }
  return data;
}

describe("E3.6-B — server-basic-v1 bake + decode", () => {
  it("decodes WAV via audio-decode to stereo PCM", async () => {
    const wav = minimalWavPcm16Mono();
    const pcm = await decodeRenderSourceToStereoPcm({
      bytes: wav,
      contentType: "audio/wav",
      label: "beat",
    });
    expect(pcm.channels).toBe(2);
    expect(pcm.frames).toBeGreaterThan(100);
    expect(pcm.sampleRate).toBe(44100);
  });

  it("empty bytes → SOURCE_DECODE class error", async () => {
    await expect(
      decodeRenderSourceToStereoPcm({
        bytes: new Uint8Array(),
        contentType: "audio/wav",
        label: "take",
      }),
    ).rejects.toBeInstanceOf(RenderJobDomainError);
  });

  it("garbage bytes → SOURCE_DECODE", async () => {
    try {
      await decodeRenderSourceToStereoPcm({
        bytes: new Uint8Array([1, 2, 3, 4, 5]),
        contentType: "audio/webm",
        label: "take",
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(renderDecodeErrorCode(e)).toBe("SOURCE_DECODE");
    }
  });

  it("resamples to 44.1 kHz stereo", () => {
    const src = synthStereo({
      sampleRate: 48000,
      frames: 4800,
      freqL: 220,
      freqR: 330,
    });
    const out = resampleStereoInterleaved(src, SERVER_BASIC_TARGET_SAMPLE_RATE);
    expect(out.sampleRate).toBe(44100);
    expect(out.channels).toBe(2);
    expect(out.frames).toBeGreaterThan(4000);
  });

  it("bakes take+beat with Basic Mix/Master params to stereo PCM", () => {
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
      amp: 0.1,
    });
    const parameters = defaultMixParameters();
    parameters.take.gainDb = -3;
    parameters.master.gainDb = -1;
    parameters.master.clipProtect = true;

    const baked = bakeServerBasicV1({ take, beat, parameters });
    expect(baked.engineId).toBe(SERVER_BASIC_BAKE_ENGINE);
    expect(baked.sampleRate).toBe(44100);
    expect(baked.channels).toBe(2);
    expect(baked.frames).toBe(4410);
    expect(baked.durationMs).toBe(100);
    expect(baked.interleaved.length).toBe(4410 * 2);
    // clip protect: no sample beyond ±1
    for (let i = 0; i < baked.interleaved.length; i++) {
      expect(Math.abs(baked.interleaved[i]!)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("golden: louder take gain increases RMS vs quieter", () => {
    const makeTake = () =>
      synthStereo({
        sampleRate: 44100,
        frames: 4410,
        freqL: 440,
        freqR: 440,
        amp: 0.3,
      });
    const makeBeat = () =>
      synthStereo({
        sampleRate: 44100,
        frames: 4410,
        freqL: 110,
        freqR: 110,
        amp: 0.05,
      });
    const quiet = defaultMixParameters();
    quiet.take.gainDb = -12;
    const loud = defaultMixParameters();
    loud.take.gainDb = 0;

    const a = bakeServerBasicV1({
      take: makeTake(),
      beat: makeBeat(),
      parameters: quiet,
      applyLoudnessMakeup: false,
    });
    const b = bakeServerBasicV1({
      take: makeTake(),
      beat: makeBeat(),
      parameters: loud,
      applyLoudnessMakeup: false,
    });
    const rms = (buf: Float32Array) => {
      let s = 0;
      for (let i = 0; i < buf.length; i++) s += (buf[i] ?? 0) ** 2;
      return Math.sqrt(s / buf.length);
    };
    expect(rms(b.interleaved)).toBeGreaterThan(rms(a.interleaved));
  });
});
