/**
 * E3.7-D — Durable WAV export (44.1 kHz / 16-bit PCM / stereo).
 * EXTERNAL worker path · private artifact QC. Fake placeholders MUST FAIL.
 */

import { createHash } from "node:crypto";

import { AUDIO_CODEC } from "@/config/audio-render";
import type { BakePcmInput } from "@/lib/audio/mp3-encode";
import { float32InterleavedToWavPcm16 } from "@/lib/audio/mp3-encode";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { decodeRenderSourceToStereoPcm } from "@/lib/audio/render-decode";

export type WavEncodeResult = {
  bytes: Buffer;
  contentType: "audio/wav";
  bitrateKbps: null;
  channels: 2;
  sampleRate: number;
  bitDepth: 16;
  durationMs: number;
  byteSize: number;
  checksumSha256: string;
  encoder: "pcm_s16le_wav";
};

export type WavQcResult = {
  ok: true;
  channels: number;
  sampleRate: number;
  bitDepth: 16;
  durationMs: number;
  byteSize: number;
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
  // Scan for fmt  and data chunks (standard PCM layout usually contiguous).
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

/**
 * QC durable WAV bytes — exact 44.1 kHz / 16-bit / stereo PCM.
 */
export async function qcWavBytes(bytes: Buffer): Promise<WavQcResult> {
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
  if (hdr.channels !== 2) {
    throw new RenderJobDomainError(
      `WAV QC: channels=${hdr.channels}, expected stereo.`,
      "INVALID",
    );
  }
  if (hdr.sampleRate !== AUDIO_CODEC.WAV_SAMPLE_RATE) {
    throw new RenderJobDomainError(
      `WAV QC: sampleRate=${hdr.sampleRate}, expected ${AUDIO_CODEC.WAV_SAMPLE_RATE}.`,
      "INVALID",
    );
  }
  if (hdr.bitsPerSample !== AUDIO_CODEC.WAV_BIT_DEPTH) {
    throw new RenderJobDomainError(
      `WAV QC: bitDepth=${hdr.bitsPerSample}, expected ${AUDIO_CODEC.WAV_BIT_DEPTH}.`,
      "INVALID",
    );
  }
  const bytesPerFrame = hdr.channels * (hdr.bitsPerSample / 8);
  const frames = Math.floor(hdr.dataSize / bytesPerFrame);
  const durationMs = Math.round((frames / hdr.sampleRate) * 1000);
  if (durationMs <= 0 || frames <= 0) {
    throw new RenderJobDomainError("WAV QC: invalid duration.", "INVALID");
  }

  await decodeRenderSourceToStereoPcm({
    bytes: new Uint8Array(bytes),
    contentType: "audio/wav",
    label: "beat",
  });

  return {
    ok: true,
    channels: 2,
    sampleRate: hdr.sampleRate,
    bitDepth: 16,
    durationMs,
    byteSize: bytes.byteLength,
  };
}

/** Encode bake PCM → WAV 44.1 / 16-bit / stereo. */
export async function encodeWavFromBake(
  bake: BakePcmInput,
): Promise<WavEncodeResult> {
  if (bake.sampleRate !== AUDIO_CODEC.WAV_SAMPLE_RATE) {
    throw new RenderJobDomainError(
      `WAV encode: sampleRate=${bake.sampleRate}, expected ${AUDIO_CODEC.WAV_SAMPLE_RATE}.`,
      "INVALID",
    );
  }
  if (bake.channels !== 2) {
    throw new RenderJobDomainError("WAV encode: expected stereo.", "INVALID");
  }
  const bytes = float32InterleavedToWavPcm16({
    interleaved: bake.interleaved,
    sampleRate: bake.sampleRate,
    channels: bake.channels,
  });
  const qc = await qcWavBytes(bytes);
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    contentType: "audio/wav",
    bitrateKbps: null,
    channels: 2,
    sampleRate: qc.sampleRate,
    bitDepth: 16,
    durationMs: qc.durationMs,
    byteSize: qc.byteSize,
    checksumSha256: `sha256:${checksumSha256}`,
    encoder: "pcm_s16le_wav",
  };
}
