/**
 * SFM Stage D — quality encode/QC pure unit coverage (A07/A08-adjacent).
 * Synthetic PCM only · no DB · no flag · no Contabo · no Storage.
 */

import { describe, expect, it } from "vitest";

import { AUDIO_CODEC } from "@/config/audio-render";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  encodeSfmQualityFromBake,
  expectedEncodeParamsForSfmQuality,
  qcSfmQualityBytes,
  renderJobTierForSfmQuality,
} from "@/lib/sfm/sfm-quality-encode";
import {
  SFM_QUALITIES,
  SFM_QUALITY_TECH,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";

function synthBake(frames = 4410): BakePcmInput {
  const interleaved = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const t = i / AUDIO_CODEC.WAV_SAMPLE_RATE;
    interleaved[i * 2] = Math.sin(2 * Math.PI * 440 * t) * 0.2;
    interleaved[i * 2 + 1] = Math.sin(2 * Math.PI * 660 * t) * 0.2;
  }
  return {
    sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
    channels: 2,
    interleaved,
    frames,
    durationMs: Math.max(1, Math.round((frames / AUDIO_CODEC.WAV_SAMPLE_RATE) * 1000)),
  };
}

describe("SFM quality encode — tier / params mapping", () => {
  it("maps product qualities to render_jobs.requested_tier", () => {
    expect(renderJobTierForSfmQuality("MP3_128")).toBe("BASIC_MP3");
    expect(renderJobTierForSfmQuality("MP3_192")).toBe("MP3_192");
    expect(renderJobTierForSfmQuality("MP3_320")).toBe("HQ_MP3");
    expect(renderJobTierForSfmQuality("WAV")).toBe("WAV");
  });

  it("exposes expected encode params for all product qualities", () => {
    for (const quality of SFM_QUALITIES) {
      const params = expectedEncodeParamsForSfmQuality(quality);
      expect(params.channels).toBe(AUDIO_CODEC.CHANNELS);
      expect(params.sampleRate).toBe(AUDIO_CODEC.WAV_SAMPLE_RATE);
      if (quality === "WAV") {
        expect(params.container).toBe("wav");
        expect(params.bitDepth).toBe(AUDIO_CODEC.WAV_BIT_DEPTH);
        expect(params.cbrKbps).toBeUndefined();
      } else {
        expect(params.container).toBe("mp3");
        expect(params.cbrKbps).toBe(
          (SFM_QUALITY_TECH[quality] as { cbrKbps: number }).cbrKbps,
        );
      }
    }
  });
});

describe("SFM quality encode — WAV bake + QC (A07)", () => {
  it("encodes stereo 44.1 kHz / 16-bit WAV and returns QC-passed artifact", async () => {
    const bake = synthBake();
    const artifact = await encodeSfmQualityFromBake("WAV", bake);
    expect(artifact.quality).toBe("WAV");
    expect(artifact.qcPassed).toBe(true);
    expect(artifact.contentType).toBe("audio/wav");
    expect(artifact.sampleRate).toBe(AUDIO_CODEC.WAV_SAMPLE_RATE);
    expect(artifact.bitrateKbps).toBeNull();
    expect(artifact.encoder).toBe("pcm_s16le_wav");
    expect(artifact.byteSize).toBeGreaterThan(100);
    expect(artifact.durationMs).toBeGreaterThan(50);
    expect(artifact.checksumSha256.startsWith("sha256:")).toBe(true);
    expect(artifact.bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(artifact.bytes.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("rejects empty bytes in QC (fail-closed)", async () => {
    await expect(qcSfmQualityBytes("WAV", Buffer.alloc(0))).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
    await expect(qcSfmQualityBytes("MP3_128", Buffer.alloc(0))).rejects.toThrow(
      /empty/i,
    );
  });

  it("rejects wrong sample-rate bake before WAV encode", async () => {
    const bad: BakePcmInput = {
      ...synthBake(100),
      sampleRate: 48000,
    };
    await expect(encodeSfmQualityFromBake("WAV", bad)).rejects.toBeInstanceOf(
      RenderJobDomainError,
    );
  });
});

describe("SFM quality encode — exhaustiveness guard", () => {
  it("covers every SfmQuality in tier and params maps", () => {
    const qualities: SfmQuality[] = ["MP3_128", "MP3_192", "MP3_320", "WAV"];
    expect(qualities).toEqual([...SFM_QUALITIES]);
    for (const q of qualities) {
      expect(renderJobTierForSfmQuality(q)).toBeTruthy();
      expect(expectedEncodeParamsForSfmQuality(q).container).toMatch(/mp3|wav/);
    }
  });
});
