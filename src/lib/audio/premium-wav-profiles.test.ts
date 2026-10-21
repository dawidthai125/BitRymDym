import { describe, expect, it } from "vitest";

import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import {
  encodeWavProfileFromBake,
  float32InterleavedToWavPcm24,
  inferWavProfileFromHeader,
  qcWavBytesForProfile,
} from "@/lib/audio/wav-encode";

function sineBake(sampleRate: number, seconds = 0.05): BakePcmInput {
  const frames = Math.floor(sampleRate * seconds);
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const s = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.2;
    interleaved[i * 2] = s;
    interleaved[i * 2 + 1] = s;
  }
  return {
    interleaved,
    sampleRate,
    channels: 2,
    frames,
    durationMs: Math.round(seconds * 1000),
  };
}

describe("PREMIUM-05 WAV profiles encode/QC", () => {
  it("WAV_COMPAT is 16/44100", async () => {
    const encoded = await encodeWavProfileFromBake(sineBake(44100), "WAV_COMPAT");
    expect(encoded.bitDepth).toBe(16);
    expect(encoded.sampleRate).toBe(44100);
    expect(encoded.encoder).toBe("pcm_s16le_wav");
    const qc = await qcWavBytesForProfile(encoded.bytes, "WAV_COMPAT");
    expect(qc.profile).toBe("WAV_COMPAT");
  });

  it("WAV_PRO is 24/44100 with TPDF pcm_s24le", async () => {
    const encoded = await encodeWavProfileFromBake(sineBake(44100), "WAV_PRO");
    expect(encoded.bitDepth).toBe(24);
    expect(encoded.sampleRate).toBe(44100);
    expect(encoded.encoder).toBe("pcm_s24le_wav");
    expect(inferWavProfileFromHeader(encoded.bytes)).toBe("WAV_PRO");
    await expect(
      qcWavBytesForProfile(encoded.bytes, "WAV_COMPAT"),
    ).rejects.toThrow(/bitDepth/);
  });

  it("WAV_MASTER resamples to 24/48000", async () => {
    const encoded = await encodeWavProfileFromBake(sineBake(44100), "WAV_MASTER");
    expect(encoded.bitDepth).toBe(24);
    expect(encoded.sampleRate).toBe(48000);
    expect(inferWavProfileFromHeader(encoded.bytes)).toBe("WAV_MASTER");
    const qc = await qcWavBytesForProfile(encoded.bytes, "WAV_MASTER");
    expect(qc.ok).toBe(true);
  });

  it("rejects fake placeholder and wrong profile", async () => {
    await expect(
      qcWavBytesForProfile(
        Buffer.from("e3.5-fake-placeholder:job:WAV\n", "utf8"),
        "WAV_COMPAT",
      ),
    ).rejects.toThrow(/fake/);
    const pcm24 = float32InterleavedToWavPcm24({
      interleaved: new Float32Array(44100 * 0.02 * 2),
      sampleRate: 44100,
      channels: 2,
    });
    await expect(qcWavBytesForProfile(pcm24, "WAV_MASTER")).rejects.toThrow(
      /sampleRate/,
    );
  });
});
