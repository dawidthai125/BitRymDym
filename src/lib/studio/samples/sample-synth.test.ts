import { describe, expect, it } from "vitest";

import {
  SAMPLE_RATE,
  encodePcm16Wav,
  renderInstrumentSample,
  wavDurationMs,
} from "@/lib/studio/samples/sample-synth";

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0;
  let count = 0;
  for (let i = start; i < end && i < samples.length; i++) {
    const value = samples[i] ?? 0;
    sum += value * value;
    count += 1;
  }
  return count === 0 ? 0 : Math.sqrt(sum / count);
}

describe("studio sample synth", () => {
  it("writes a wav of the requested length", () => {
    const pcm = renderInstrumentSample({
      instrument: "piano",
      midi: 60,
      durationMs: 2000,
    });
    const wav = encodePcm16Wav(pcm, SAMPLE_RATE);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    expect(wavDurationMs(wav)).toBe(2000);
  });

  it("makes a piano note decay and a kick hit the start", () => {
    const piano = renderInstrumentSample({
      instrument: "piano",
      midi: 60,
      durationMs: 2000,
    });
    const window = Math.floor(SAMPLE_RATE * 0.1);
    expect(rms(piano, 0, window)).toBeGreaterThan(rms(piano, piano.length - window, piano.length));

    const kick = renderInstrumentSample({
      instrument: "kick",
      midi: 36,
      durationMs: 1000,
    });
    const early = rms(kick, 0, Math.floor(SAMPLE_RATE * 0.05));
    const late = rms(kick, Math.floor(SAMPLE_RATE * 0.6), kick.length);
    expect(early).toBeGreaterThan(late * 5);
  });
});
