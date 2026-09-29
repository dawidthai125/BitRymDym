import { describe, expect, it } from "vitest";

import {
  encodeHqMp3FromBake,
  qcHqMp3Bytes,
} from "@/lib/audio/mp3-encode";
import { assertNativeFfmpegAvailable } from "@/lib/audio/native-ffmpeg";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { bakeServerProV1 } from "@/lib/audio/server-pro-bake";
import {
  defaultMixParameters,
  defaultMixProParams,
} from "@/lib/mix/params";

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

describe("E3.7-C — HQ MP3 320 encode + QC", () => {
  it("ffmpeg available", async () => {
    const info = await assertNativeFfmpegAvailable();
    expect(info.versionLine.toLowerCase()).toContain("ffmpeg");
  });

  it("encodes server-pro-v1 bake to ~320 kbps stereo and passes QC", async () => {
    const parameters = defaultMixParameters();
    parameters.pro = defaultMixProParams();
    const bake = bakeServerProV1({
      take: synthStereo(),
      beat: synthStereo(),
      parameters,
      applyLoudnessMakeup: false,
    });
    expect(bake.masterApplied).toBe(true);
    const encoded = await encodeHqMp3FromBake(bake);
    expect(encoded.contentType).toBe("audio/mpeg");
    expect(encoded.channels).toBe(2);
    expect(encoded.bitrateKbps).toBeGreaterThanOrEqual(280);
    expect(encoded.bitrateKbps).toBeLessThanOrEqual(360);
    expect(encoded.durationMs).toBeGreaterThan(100);
    expect(encoded.checksumSha256.startsWith("sha256:")).toBe(true);

    const qc = await qcHqMp3Bytes(encoded.bytes);
    expect(qc.ok).toBe(true);
    expect(qc.channels).toBe(2);
  }, 60_000);

  it("rejects fake placeholder in HQ QC", async () => {
    const fake = Buffer.from("e3.5-fake-placeholder:job:HQ_MP3\n", "utf8");
    await expect(qcHqMp3Bytes(fake)).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
  });
});
