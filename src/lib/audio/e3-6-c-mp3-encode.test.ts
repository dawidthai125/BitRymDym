import { describe, expect, it } from "vitest";

import {
  encodeBasicMp3FromBake,
  qcBasicMp3Bytes,
} from "@/lib/audio/mp3-encode";
import { assertNativeFfmpegAvailable } from "@/lib/audio/native-ffmpeg";
import { bakeServerBasicV1 } from "@/lib/audio/server-basic-bake";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { defaultMixParameters } from "@/lib/mix/params";

function synthStereo(frames = 4410 * 2) {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const t = i / 44100;
    interleaved[i * 2] = Math.sin(2 * Math.PI * 440 * t) * 0.2;
    interleaved[i * 2 + 1] = Math.sin(2 * Math.PI * 660 * t) * 0.2;
  }
  return {
    sampleRate: 44100,
    channels: 2 as const,
    interleaved,
    frames,
  };
}

describe("E3.6-C — native FFmpeg Basic MP3", () => {
  it("ffmpeg is available on EXTERNAL worker host", async () => {
    const info = await assertNativeFfmpegAvailable();
    expect(info.versionLine.toLowerCase()).toContain("ffmpeg");
  });

  it("encodes bake PCM to 128 kbps stereo audio/mpeg and passes QC", async () => {
    const take = synthStereo();
    const beat = synthStereo();
    const bake = bakeServerBasicV1({
      take,
      beat,
      parameters: defaultMixParameters(),
      applyLoudnessMakeup: false,
    });
    const encoded = await encodeBasicMp3FromBake(bake);
    expect(encoded.contentType).toBe("audio/mpeg");
    expect(encoded.channels).toBe(2);
    expect(encoded.byteSize).toBeGreaterThan(500);
    expect(encoded.bitrateKbps).toBeGreaterThanOrEqual(110);
    expect(encoded.bitrateKbps).toBeLessThanOrEqual(146);
    expect(encoded.durationMs).toBeGreaterThan(100);
    expect(encoded.checksumSha256.startsWith("sha256:")).toBe(true);
    expect(encoded.encoder).toContain("libmp3lame");

    const qc = await qcBasicMp3Bytes(encoded.bytes);
    expect(qc.ok).toBe(true);
    expect(qc.channels).toBe(2);
  }, 60_000);

  it("rejects fake placeholder bytes in QC", async () => {
    const fake = Buffer.from("e3.5-fake-placeholder:job:BASIC_MP3\n", "utf8");
    await expect(qcBasicMp3Bytes(fake)).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
  });

  it("rejects empty / garbage as non-MPEG", async () => {
    await expect(qcBasicMp3Bytes(Buffer.alloc(0))).rejects.toThrow(/empty/);
    await expect(qcBasicMp3Bytes(Buffer.from([1, 2, 3, 4]))).rejects.toThrow(
      /MPEG|fake/i,
    );
  });
});
