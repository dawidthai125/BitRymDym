import { describe, expect, it } from "vitest";

import { analyzeBeatBpm } from "@/lib/beats/audio-bpm";
import { isBpmDecodeSupportedMime } from "@/lib/beats/audio-pcm-decode";

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]!));
    buffer.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return new Uint8Array(buffer);
}

function clickTrack(bpm: number, seconds = 8, sampleRate = 44100): Float32Array {
  const period = 60 / bpm;
  const n = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(n);
  const clickLen = Math.floor(sampleRate * 0.008);
  for (let t = 0; t < seconds; t += period) {
    const i = Math.floor(t * sampleRate);
    for (let k = 0; k < clickLen; k++) {
      if (i + k < n) samples[i + k] = 1;
    }
  }
  return samples;
}

describe("isBpmDecodeSupportedMime", () => {
  it("allows wav/mpeg only for auto BPM decode", () => {
    expect(isBpmDecodeSupportedMime("audio/wav")).toBe(true);
    expect(isBpmDecodeSupportedMime("audio/mpeg")).toBe(true);
    expect(isBpmDecodeSupportedMime("audio/flac")).toBe(false);
    expect(isBpmDecodeSupportedMime("audio/mp4")).toBe(false);
    expect(isBpmDecodeSupportedMime("audio/aac")).toBe(false);
  });
});

describe("analyzeBeatBpm (ensemble)", () => {
  it("returns a decision for synthetic 120 WAV (smoke — not accuracy cert)", async () => {
    const bytes = encodeWav(clickTrack(120, 10), 44100);
    const result = await analyzeBeatBpm({
      bytes,
      contentType: "audio/wav",
    });
    expect(["auto_suggest", "manual_required"]).toContain(result.status);
    if (result.status === "auto_suggest") {
      expect(result.bpm).toBeGreaterThanOrEqual(1);
      expect(result.bpm).toBeLessThanOrEqual(300);
      expect(result.source).toBe("ensemble");
    }
    if (result.status === "manual_required") {
      expect(result.message.length).toBeGreaterThan(0);
      expect(result.analysis.status).toBe("MANUAL_REQUIRED");
    }
  }, 20_000);

  it("returns unavailable for FLAC mime", async () => {
    const bytes = encodeWav(clickTrack(120), 44100);
    const result = await analyzeBeatBpm({
      bytes,
      contentType: "audio/flac",
    });
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toBe("unsupported_format");
    }
  });

  it("returns unavailable for malformed bytes with wav mime", async () => {
    const result = await analyzeBeatBpm({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      contentType: "audio/wav",
    });
    expect(result.status).toBe("unavailable");
  });
});
