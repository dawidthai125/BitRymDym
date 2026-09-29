/**
 * E3.6-C / E3.7-C — MP3 encode via native FFmpeg libmp3lame (OD-E36-04 = C).
 * Basic = 128 kbps · HQ = 320 kbps. Fake/placeholder bytes MUST FAIL QC.
 */

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AUDIO_CODEC } from "@/config/audio-render";
import {
  assertNativeFfmpegAvailable,
  resolveFfprobeBin,
  resolveFfmpegBin,
  runCapture,
  runFfmpegFile,
} from "@/lib/audio/native-ffmpeg";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { decodeRenderSourceToStereoPcm } from "@/lib/audio/render-decode";

export const BASIC_MP3_TARGET_BITRATE_KBPS =
  AUDIO_CODEC.BASIC_MP3_BITRATE_KBPS; // 128

export const HQ_MP3_TARGET_BITRATE_KBPS = AUDIO_CODEC.HQ_MP3_BITRATE_KBPS; // 320

/** LAME CBR may report ~±8–12% around target depending on build. REUSE for HQ. */
export const BASIC_MP3_BITRATE_TOLERANCE_RATIO = 0.12;
export const HQ_MP3_BITRATE_TOLERANCE_RATIO = BASIC_MP3_BITRATE_TOLERANCE_RATIO;

export type BakePcmInput = {
  interleaved: Float32Array;
  sampleRate: number;
  channels: 2;
  frames: number;
  durationMs: number;
};

export type Mp3EncodeResult = {
  bytes: Buffer;
  contentType: "audio/mpeg";
  bitrateKbps: number;
  channels: 2;
  sampleRate: number;
  durationMs: number;
  byteSize: number;
  checksumSha256: string;
  encoder: string;
  ffmpegVersionLine: string;
};

export type Mp3QcResult = {
  ok: true;
  codecName: string;
  channels: number;
  bitrateKbps: number;
  durationMs: number;
  byteSize: number;
  sampleRate: number | null;
};

export function float32InterleavedToWavPcm16(params: {
  interleaved: Float32Array;
  sampleRate: number;
  channels: number;
}): Buffer {
  const { interleaved, sampleRate, channels } = params;
  const frames = Math.floor(interleaved.length / channels);
  const dataSize = frames * channels * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * 2, 28);
  buf.writeUInt16LE(channels * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < frames * channels; i++) {
    const s = Math.max(-1, Math.min(1, interleaved[i] ?? 0));
    buf.writeInt16LE((s * 32767) | 0, o);
    o += 2;
  }
  return buf;
}

function looksLikeFakePlaceholder(bytes: Buffer): boolean {
  const head = bytes.subarray(0, Math.min(128, bytes.length)).toString("utf8");
  return (
    head.includes("e3.5-fake-placeholder") || head.includes("fake-placeholder")
  );
}

function hasMpegSync(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  for (let i = 0; i < Math.min(bytes.length - 1, 4096); i++) {
    if (bytes[i] === 0xff && (bytes[i + 1]! & 0xe0) === 0xe0) return true;
  }
  return false;
}

export async function probeMp3File(filePath: string): Promise<{
  codecName: string;
  channels: number;
  bitRate: number | null;
  sampleRate: number | null;
  durationSec: number | null;
  formatName: string | null;
  size: number | null;
}> {
  const ffprobe = resolveFfprobeBin();
  const out = await runCapture(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "stream=codec_name,channels,bit_rate,sample_rate:format=duration,format_name,size",
    "-of",
    "json",
    filePath,
  ]);
  const json = JSON.parse(out) as {
    streams?: Array<{
      codec_name?: string;
      channels?: number;
      bit_rate?: string;
      sample_rate?: string;
    }>;
    format?: {
      duration?: string;
      format_name?: string;
      size?: string;
    };
  };
  const stream = json.streams?.[0];
  if (!stream?.codec_name) {
    throw new RenderJobDomainError("ffprobe: no audio stream.", "INVALID");
  }
  return {
    codecName: stream.codec_name,
    channels: stream.channels ?? 0,
    bitRate: stream.bit_rate ? Number(stream.bit_rate) : null,
    sampleRate: stream.sample_rate ? Number(stream.sample_rate) : null,
    durationSec: json.format?.duration ? Number(json.format.duration) : null,
    formatName: json.format?.format_name ?? null,
    size: json.format?.size ? Number(json.format.size) : null,
  };
}

/**
 * QC MP3 bytes against a target bitrate (Basic 128 or HQ 320). Fake placeholders MUST fail.
 */
export async function qcMp3Bytes(
  bytes: Buffer,
  targetBitrateKbps: number,
  toleranceRatio: number = BASIC_MP3_BITRATE_TOLERANCE_RATIO,
): Promise<Mp3QcResult> {
  if (!bytes.byteLength) {
    throw new RenderJobDomainError("MP3 QC: empty file.", "INVALID");
  }
  if (looksLikeFakePlaceholder(bytes) || !hasMpegSync(bytes)) {
    throw new RenderJobDomainError(
      "MP3 QC: not valid MPEG / fake placeholder rejected.",
      "INVALID",
    );
  }

  const dir = await mkdtemp(join(tmpdir(), "e3-mp3-qc-"));
  const filePath = join(dir, "probe.mp3");
  try {
    await writeFile(filePath, bytes);
    const probe = await probeMp3File(filePath);
    if (probe.codecName !== "mp3") {
      throw new RenderJobDomainError(
        `MP3 QC: codec=${probe.codecName}, expected mp3.`,
        "INVALID",
      );
    }
    if (probe.channels !== 2) {
      throw new RenderJobDomainError(
        `MP3 QC: channels=${probe.channels}, expected stereo.`,
        "INVALID",
      );
    }
    const bitrate =
      probe.bitRate != null && Number.isFinite(probe.bitRate)
        ? probe.bitRate / 1000
        : NaN;
    if (!Number.isFinite(bitrate)) {
      throw new RenderJobDomainError("MP3 QC: missing bitrate.", "INVALID");
    }
    const tol = targetBitrateKbps * toleranceRatio;
    if (Math.abs(bitrate - targetBitrateKbps) > tol) {
      throw new RenderJobDomainError(
        `MP3 QC: bitrate=${bitrate} kbps, expected ~${targetBitrateKbps}.`,
        "INVALID",
      );
    }
    const durationMs =
      probe.durationSec != null && Number.isFinite(probe.durationSec)
        ? Math.round(probe.durationSec * 1000)
        : 0;
    if (durationMs <= 0) {
      throw new RenderJobDomainError("MP3 QC: invalid duration.", "INVALID");
    }

    await decodeRenderSourceToStereoPcm({
      bytes: new Uint8Array(bytes),
      contentType: "audio/mpeg",
      label: "beat",
    });

    return {
      ok: true,
      codecName: probe.codecName,
      channels: 2,
      bitrateKbps: Math.round(bitrate),
      durationMs,
      byteSize: bytes.byteLength,
      sampleRate: probe.sampleRate,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** QC Basic MP3 (128 kbps). */
export async function qcBasicMp3Bytes(bytes: Buffer): Promise<Mp3QcResult> {
  return qcMp3Bytes(bytes, BASIC_MP3_TARGET_BITRATE_KBPS);
}

/** QC HQ MP3 (320 kbps) — E3.7-C. */
export async function qcHqMp3Bytes(bytes: Buffer): Promise<Mp3QcResult> {
  return qcMp3Bytes(
    bytes,
    HQ_MP3_TARGET_BITRATE_KBPS,
    HQ_MP3_BITRATE_TOLERANCE_RATIO,
  );
}

async function encodeMp3FromBakePcm(
  bake: BakePcmInput,
  targetBitrateKbps: number,
): Promise<Mp3EncodeResult> {
  const { versionLine } = await assertNativeFfmpegAvailable();
  const wav = float32InterleavedToWavPcm16({
    interleaved: bake.interleaved,
    sampleRate: bake.sampleRate,
    channels: bake.channels,
  });

  const dir = await mkdtemp(join(tmpdir(), "e3-mp3-enc-"));
  const wavPath = join(dir, "bake.wav");
  const mp3Path = join(dir, "out.mp3");
  try {
    await writeFile(wavPath, wav);
    const ffmpeg = resolveFfmpegBin();
    await runFfmpegFile([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      wavPath,
      "-codec:a",
      "libmp3lame",
      "-b:a",
      `${targetBitrateKbps}k`,
      "-ac",
      "2",
      "-ar",
      String(AUDIO_CODEC.WAV_SAMPLE_RATE),
      mp3Path,
    ]);
    const bytes = await readFile(mp3Path);
    const qc = await qcMp3Bytes(bytes, targetBitrateKbps);
    const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
    return {
      bytes,
      contentType: "audio/mpeg",
      bitrateKbps: qc.bitrateKbps,
      channels: 2,
      sampleRate: qc.sampleRate ?? AUDIO_CODEC.WAV_SAMPLE_RATE,
      durationMs: qc.durationMs,
      byteSize: qc.byteSize,
      checksumSha256: `sha256:${checksumSha256}`,
      encoder: `${ffmpeg}+libmp3lame`,
      ffmpegVersionLine: versionLine,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Encode PCM bake → MP3 128 kbps stereo (E3.6 Basic). */
export async function encodeBasicMp3FromBake(
  bake: BakePcmInput,
): Promise<Mp3EncodeResult> {
  return encodeMp3FromBakePcm(bake, BASIC_MP3_TARGET_BITRATE_KBPS);
}

/** Encode PCM bake → MP3 320 kbps stereo (E3.7 HQ). */
export async function encodeHqMp3FromBake(
  bake: BakePcmInput,
): Promise<Mp3EncodeResult> {
  return encodeMp3FromBakePcm(bake, HQ_MP3_TARGET_BITRATE_KBPS);
}
