/**
 * SFM Stage D — lazy quality encode + QC via existing TAKE/E3 primitives.
 * Does not invent codec params; uses AUDIO_CODEC / SFM_QUALITY_TECH.
 */

import { AUDIO_CODEC } from "@/config/audio-render";
import {
  encodeBasicMp3FromBake,
  encodeHqMp3FromBake,
  encodeMp3192FromBake,
  qcBasicMp3Bytes,
  qcHqMp3Bytes,
  qcMp3Bytes,
  MP3_192_TARGET_BITRATE_KBPS,
  type BakePcmInput,
  type Mp3EncodeResult,
} from "@/lib/audio/mp3-encode";
import {
  encodeWavFromBake,
  qcWavBytes,
  type WavEncodeResult,
} from "@/lib/audio/wav-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import {
  SFM_QUALITY_TECH,
  type SfmQuality,
} from "@/lib/sfm/sfm-plan-matrix";

export type SfmEncodedArtifact = {
  quality: SfmQuality;
  bytes: Buffer;
  contentType: string;
  byteSize: number;
  durationMs: number;
  checksumSha256: string;
  sampleRate: number;
  bitrateKbps: number | null;
  encoder: string;
  qcPassed: true;
};

export function renderJobTierForSfmQuality(
  quality: SfmQuality,
): "BASIC_MP3" | "MP3_192" | "HQ_MP3" | "WAV" {
  switch (quality) {
    case "MP3_128":
      return "BASIC_MP3";
    case "MP3_192":
      return "MP3_192";
    case "MP3_320":
      return "HQ_MP3";
    case "WAV":
      return "WAV";
  }
}

export function expectedEncodeParamsForSfmQuality(quality: SfmQuality): {
  container: "mp3" | "wav";
  cbrKbps?: number;
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
} {
  const tech = SFM_QUALITY_TECH[quality];
  if (quality === "WAV") {
    return {
      container: "wav",
      sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
      bitDepth: AUDIO_CODEC.WAV_BIT_DEPTH,
      channels: AUDIO_CODEC.CHANNELS,
    };
  }
  return {
    container: "mp3",
    cbrKbps: (tech as { cbrKbps: number }).cbrKbps,
    channels: AUDIO_CODEC.CHANNELS,
    sampleRate: AUDIO_CODEC.WAV_SAMPLE_RATE,
  };
}

/** QC already-encoded bytes for a product quality (fail-closed). */
export async function qcSfmQualityBytes(
  quality: SfmQuality,
  bytes: Buffer,
): Promise<void> {
  if (!bytes.byteLength) {
    throw new RenderJobDomainError("SFM QC: empty file.", "INVALID");
  }
  if (quality === "WAV") {
    await qcWavBytes(bytes);
    return;
  }
  if (quality === "MP3_128") {
    await qcBasicMp3Bytes(bytes);
    return;
  }
  if (quality === "MP3_192") {
    await qcMp3Bytes(bytes, MP3_192_TARGET_BITRATE_KBPS);
    return;
  }
  await qcHqMp3Bytes(bytes);
}

/** Encode bake PCM → product quality; QC before return. */
export async function encodeSfmQualityFromBake(
  quality: SfmQuality,
  bake: BakePcmInput,
): Promise<SfmEncodedArtifact> {
  let encoded: Mp3EncodeResult | WavEncodeResult;
  if (quality === "WAV") {
    encoded = await encodeWavFromBake(bake);
  } else if (quality === "MP3_128") {
    encoded = await encodeBasicMp3FromBake(bake);
  } else if (quality === "MP3_192") {
    encoded = await encodeMp3192FromBake(bake);
  } else {
    encoded = await encodeHqMp3FromBake(bake);
  }

  await qcSfmQualityBytes(quality, encoded.bytes);

  return {
    quality,
    bytes: encoded.bytes,
    contentType: encoded.contentType,
    byteSize: encoded.byteSize,
    durationMs: encoded.durationMs,
    checksumSha256: encoded.checksumSha256,
    sampleRate: encoded.sampleRate,
    bitrateKbps: encoded.bitrateKbps,
    encoder: encoded.encoder,
    qcPassed: true,
  };
}
