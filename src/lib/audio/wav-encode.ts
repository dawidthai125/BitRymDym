/**
 * E3.7-D / PREMIUM-05 — Durable WAV export profiles.
 * WAV_COMPAT: 44.1 kHz / 16-bit PCM stereo (legacy encodeWavFromBake).
 * WAV_PRO: 44.1 kHz / 24-bit PCM stereo.
 * WAV_MASTER: 48 kHz / 24-bit PCM stereo.
 * Fake placeholders MUST FAIL QC.
 */

import { createHash } from "node:crypto";

import { AUDIO_CODEC } from "@/config/audio-render";
import {
  PREMIUM_WAV_PROFILES,
  type PremiumWavProfileId,
} from "@/config/premium-export-policy";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { float32InterleavedToWavPcm16 } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { decodeRenderSourceToStereoPcm } from "@/lib/audio/render-decode";
import { resampleStereoInterleaved } from "@/lib/audio/server-basic-bake";

export type WavBitDepth = 16 | 24;

export type WavEncodeResult = {
  bytes: Buffer;
  contentType: "audio/wav";
  bitrateKbps: null;
  channels: 2;
  sampleRate: number;
  bitDepth: WavBitDepth;
  durationMs: number;
  byteSize: number;
  checksumSha256: string;
  encoder: "pcm_s16le_wav" | "pcm_s24le_wav";
  profile: PremiumWavProfileId;
};

export type WavQcResult = {
  ok: true;
  channels: number;
  sampleRate: number;
  bitDepth: WavBitDepth;
  durationMs: number;
  byteSize: number;
  profile: PremiumWavProfileId;
};

function looksLikeFakePlaceholder(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(128, bytes.length)).toString("utf8");
  return (
    head.includes("e3.5-fake-placeholder") || head.includes("fake-placeholder")
  );
}

function readWavHeader(bytes: Buffer): {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataSize: number;
} {
  if (bytes.byteLength < 44) {
    throw new RenderJobDomainError("WAV QC: file too short.", "INVALID");
  }
  if (bytes.toString("ascii", 0, 4) !== "RIFF") {
    throw new RenderJobDomainError("WAV QC: missing RIFF.", "INVALID");
  }
  if (bytes.toString("ascii", 8, 12) !== "WAVE") {
    throw new RenderJobDomainError("WAV QC: missing WAVE.", "INVALID");
  }
  let offset = 12;
  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  let sawFmt = false;
  let sawData = false;
  while (offset + 8 <= bytes.byteLength) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt ") {
      if (size < 16 || body + 16 > bytes.byteLength) {
        throw new RenderJobDomainError("WAV QC: truncated fmt.", "INVALID");
      }
      audioFormat = bytes.readUInt16LE(body);
      channels = bytes.readUInt16LE(body + 2);
      sampleRate = bytes.readUInt32LE(body + 4);
      bitsPerSample = bytes.readUInt16LE(body + 14);
      sawFmt = true;
    } else if (id === "data") {
      dataSize = size;
      sawData = true;
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!sawFmt || !sawData) {
    throw new RenderJobDomainError("WAV QC: missing fmt/data chunk.", "INVALID");
  }
  return { audioFormat, channels, sampleRate, bitsPerSample, dataSize };
}

/** PCM 24-bit little-endian packed (3 bytes / sample). TPDF dither from float. */
export function float32InterleavedToWavPcm24(params: {
  interleaved: Float32Array;
  sampleRate: number;
  channels: number;
}): Buffer {
  const { interleaved, sampleRate, channels } = params;
  const frames = Math.floor(interleaved.length / channels);
  const dataSize = frames * channels * 3;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 3, 28);
  buf.writeUInt16LE(channels * 3, 32);
  buf.writeUInt16LE(24, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < frames * channels; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i] ?? 0));
    // TPDF dither (±1 LSB of 24-bit) before quantize
    const dither = (Math.random() + Math.random() - 1) / 8388608;
    let v = Math.round(s * 8388607 + dither);
    v = Math.max(-8388608, Math.min(8388607, v));
    buf[o] = v & 0xff;
    buf[o + 1] = (v >> 8) & 0xff;
    buf[o + 2] = (v >> 16) & 0xff;
    o += 3;
  }
  return buf;
}

function profileForParams(
  sampleRate: number,
  bitDepth: number,
): PremiumWavProfileId | null {
  if (sampleRate === 44100 && bitDepth === 16) return "WAV_COMPAT";
  if (sampleRate === 44100 && bitDepth === 24) return "WAV_PRO";
  if (sampleRate === 48000 && bitDepth === 24) return "WAV_MASTER";
  return null;
}

export async function qcWavBytesForProfile(
  bytes: Buffer,
  profile: PremiumWavProfileId,
): Promise<WavQcResult> {
  const expected = PREMIUM_WAV_PROFILES[profile];
  if (!bytes.byteLength) {
    throw new RenderJobDomainError("WAV QC: empty file.", "INVALID");
  }
  if (looksLikeFakePlaceholder(bytes)) {
    throw new RenderJobDomainError(
      "WAV QC: fake placeholder rejected.",
      "INVALID",
    );
  }
  const hdr = readWavHeader(bytes);
  if (hdr.audioFormat !== 1) {
    throw new RenderJobDomainError(
      `WAV QC: audioFormat=${hdr.audioFormat}, expected PCM(1).`,
      "INVALID",
    );
  }
  if (hdr.channels !== expected.channels) {
    throw new RenderJobDomainError(
      `WAV QC: channels=${hdr.channels}, expected ${expected.channels}.`,
      "INVALID",
    );
  }
  if (hdr.sampleRate !== expected.sampleRate) {
    throw new RenderJobDomainError(
      `WAV QC: sampleRate=${hdr.sampleRate}, expected ${expected.sampleRate}.`,
      "INVALID",
    );
  }
  if (hdr.bitsPerSample !== expected.bitDepth) {
    throw new RenderJobDomainError(
      `WAV QC: bitDepth=${hdr.bitsPerSample}, expected ${expected.bitDepth}.`,
      "INVALID",
    );
  }
  const bytesPerSample = expected.bitDepth / 8;
  const bytesPerFrame = hdr.channels * bytesPerSample;
  const frames = Math.floor(hdr.dataSize / bytesPerFrame);
  const durationMs = Math.round((frames / hdr.sampleRate) * 1000);
  if (durationMs <= 0 || frames <= 0) {
    throw new RenderJobDomainError("WAV QC: invalid duration.", "INVALID");
  }

  // Decode path supports 16-bit PCM WAV; for 24-bit validate header+size only
  // (decoder may not accept packed 24-bit in all environments).
  if (expected.bitDepth === 16) {
    await decodeRenderSourceToStereoPcm({
      bytes: new Uint8Array(bytes),
      contentType: "audio/wav",
      label: "beat",
    });
  }

  return {
    ok: true,
    channels: 2,
    sampleRate: hdr.sampleRate,
    bitDepth: expected.bitDepth,
    durationMs,
    byteSize: bytes.byteLength,
    profile,
  };
}

/**
 * QC durable WAV bytes — exact 44.1 kHz / 16-bit / stereo PCM (COMPAT).
 * Legacy contract for E3 / SFM callers.
 */
export async function qcWavBytes(bytes: Buffer): Promise<{
  ok: true;
  channels: number;
  sampleRate: number;
  bitDepth: 16;
  durationMs: number;
  byteSize: number;
}> {
  const qc = await qcWavBytesForProfile(bytes, "WAV_COMPAT");
  return {
    ok: true,
    channels: qc.channels,
    sampleRate: qc.sampleRate,
    bitDepth: 16,
    durationMs: qc.durationMs,
    byteSize: qc.byteSize,
  };
}

function prepareBakeForProfile(
  bake: BakePcmInput,
  profile: PremiumWavProfileId,
): BakePcmInput {
  const target = PREMIUM_WAV_PROFILES[profile];
  if (bake.channels !== 2) {
    throw new RenderJobDomainError("WAV encode: expected stereo.", "INVALID");
  }
  if (bake.sampleRate === target.sampleRate) {
    return bake;
  }
  const resampled = resampleStereoInterleaved(
    {
      interleaved: bake.interleaved,
      sampleRate: bake.sampleRate,
      channels: 2,
      frames: bake.frames,
    },
    target.sampleRate,
  );
  return {
    interleaved: resampled.interleaved,
    sampleRate: target.sampleRate,
    channels: 2,
    frames: resampled.frames,
    durationMs: Math.round((resampled.frames / target.sampleRate) * 1000),
  };
}

export async function encodeWavProfileFromBake(
  bake: BakePcmInput,
  profile: PremiumWavProfileId,
): Promise<WavEncodeResult> {
  const target = PREMIUM_WAV_PROFILES[profile];
  const prepared = prepareBakeForProfile(bake, profile);
  const bytes =
    target.bitDepth === 16
      ? float32InterleavedToWavPcm16({
          interleaved: prepared.interleaved,
          sampleRate: prepared.sampleRate,
          channels: 2,
        })
      : float32InterleavedToWavPcm24({
          interleaved: prepared.interleaved,
          sampleRate: prepared.sampleRate,
          channels: 2,
        });
  const qc = await qcWavBytesForProfile(bytes, profile);
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    contentType: "audio/wav",
    bitrateKbps: null,
    channels: 2,
    sampleRate: qc.sampleRate,
    bitDepth: qc.bitDepth,
    durationMs: qc.durationMs,
    byteSize: qc.byteSize,
    checksumSha256: `sha256:${checksumSha256}`,
    encoder: target.bitDepth === 16 ? "pcm_s16le_wav" : "pcm_s24le_wav",
    profile,
  };
}

/** Encode bake PCM → WAV 44.1 / 16-bit / stereo (COMPAT / legacy). */
export async function encodeWavFromBake(
  bake: BakePcmInput,
): Promise<Omit<WavEncodeResult, "profile"> & { bitDepth: 16; encoder: "pcm_s16le_wav" }> {
  if (bake.sampleRate !== AUDIO_CODEC.WAV_SAMPLE_RATE) {
    throw new RenderJobDomainError(
      `WAV encode: sampleRate=${bake.sampleRate}, expected ${AUDIO_CODEC.WAV_SAMPLE_RATE}.`,
      "INVALID",
    );
  }
  const encoded = await encodeWavProfileFromBake(bake, "WAV_COMPAT");
  return {
    bytes: encoded.bytes,
    contentType: "audio/wav",
    bitrateKbps: null,
    channels: 2,
    sampleRate: encoded.sampleRate,
    bitDepth: 16,
    durationMs: encoded.durationMs,
    byteSize: encoded.byteSize,
    checksumSha256: encoded.checksumSha256,
    encoder: "pcm_s16le_wav",
  };
}

export function inferWavProfileFromHeader(
  bytes: Buffer,
): PremiumWavProfileId | null {
  try {
    const hdr = readWavHeader(bytes);
    return profileForParams(hdr.sampleRate, hdr.bitsPerSample);
  } catch {
    return null;
  }
}
