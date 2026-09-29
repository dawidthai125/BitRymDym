import { describe, expect, it } from "vitest";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { bakeServerProV1 } from "@/lib/audio/server-pro-bake";
import { encodeWavFromBake, qcWavBytes } from "@/lib/audio/wav-encode";
import {
  defaultMixParameters,
  defaultMixProParams,
} from "@/lib/mix/params";

function synthStereo(frames = 4410) {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const t = i / 44100;
    interleaved[i * 2] = Math.sin(2 * Math.PI * 440 * t) * 0.2;
    interleaved[i * 2 + 1] = Math.sin(2 * Math.PI * 550 * t) * 0.2;
  }
  return {
    sampleRate: 44100,
    channels: 2 as const,
    interleaved,
    frames,
  };
}

describe("E3.7-D — WAV 44.1/16/stereo encode + QC", () => {
  it("encodes server-pro-v1 bake to WAV PCM and passes QC", async () => {
    const parameters = defaultMixParameters();
    parameters.pro = defaultMixProParams();
    const bake = bakeServerProV1({
      take: synthStereo(),
      beat: synthStereo(),
      parameters,
      applyLoudnessMakeup: false,
    });
    const encoded = await encodeWavFromBake(bake);
    expect(encoded.contentType).toBe("audio/wav");
    expect(encoded.channels).toBe(2);
    expect(encoded.sampleRate).toBe(44100);
    expect(encoded.bitDepth).toBe(16);
    expect(encoded.bitrateKbps).toBeNull();
    expect(encoded.durationMs).toBeGreaterThan(50);
    expect(encoded.checksumSha256.startsWith("sha256:")).toBe(true);

    const qc = await qcWavBytes(encoded.bytes);
    expect(qc.ok).toBe(true);
    expect(qc.sampleRate).toBe(44100);
    expect(qc.bitDepth).toBe(16);
    expect(qc.channels).toBe(2);
  });

  it("rejects fake placeholder and non-RIFF", async () => {
    await expect(
      qcWavBytes(Buffer.from("e3.5-fake-placeholder:job:WAV\n", "utf8")),
    ).rejects.toBeInstanceOf(RenderJobDomainError);
    await expect(qcWavBytes(Buffer.from([1, 2, 3, 4]))).rejects.toThrow(
      /RIFF|short/i,
    );
  });
});
