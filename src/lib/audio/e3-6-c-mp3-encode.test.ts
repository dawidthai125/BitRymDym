import { describe, expect, it } from "vitest";

import { assertMp3EncodeToolchain } from "@/lib/audio/mp3-encode-toolchain";
import { encodeBasicMp3FromBake, qcBasicMp3Bytes } from "@/lib/audio/mp3-encode";
import { bakeServerBasicV1 } from "@/lib/audio/server-basic-bake";
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
  it("ffmpeg, ffprobe, and libmp3lame are available on the resolved binaries", async () => {
    await assertMp3EncodeToolchain();
  });

  it("encodes bake PCM to 128 kbps stereo audio/mpeg and passes QC", async () => {
    await assertMp3EncodeToolchain();
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
});
