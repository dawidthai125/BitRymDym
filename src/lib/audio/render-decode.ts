/**
 * E3.6-B / G4 — Render source decode (EXTERNAL worker / Node).
 * Reuses existing MIT `audio-decode` (wav/mp3/webm/opus/…). No ffmpeg.
 */

import decodeAudio from "audio-decode";

import { RenderJobDomainError } from "@/lib/audio/render-job-core";

export const RENDER_DECODE_ENGINE = "audio-decode@existing" as const;

/** MIME types we attempt to decode for render bake (G4 matrix). */
export const RENDER_SOURCE_DECODE_MIME = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  "audio/opus",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mp4",
  "audio/aac",
  "application/octet-stream",
] as const;

export type DecodedPcmStereo = {
  sampleRate: number;
  channels: 2;
  /** Interleaved LRLR… Float32 in [-1, 1] (approx). */
  interleaved: Float32Array;
  frames: number;
};

export function normalizeRenderContentType(
  contentType: string | null | undefined,
): string {
  if (!contentType) return "application/octet-stream";
  return contentType.split(";")[0]!.trim().toLowerCase();
}

export function isRenderDecodeMimeAttempted(contentType: string | null): boolean {
  const base = normalizeRenderContentType(contentType);
  return (RENDER_SOURCE_DECODE_MIME as readonly string[]).some(
    (m) => m.split(";")[0] === base || m === contentType,
  );
}

function toStereoInterleaved(channelData: Float32Array[]): {
  interleaved: Float32Array;
  frames: number;
} {
  const frames = channelData[0]?.length ?? 0;
  if (frames === 0 || !channelData.length) {
    throw new RenderJobDomainError(
      "Decoded audio has no frames.",
      "INVALID",
    );
  }
  const interleaved = new Float32Array(frames * 2);
  if (channelData.length === 1) {
    const mono = channelData[0]!;
    for (let i = 0; i < frames; i++) {
      const s = mono[i] ?? 0;
      interleaved[i * 2] = s;
      interleaved[i * 2 + 1] = s;
    }
  } else {
    const left = channelData[0]!;
    const right = channelData[1]!;
    for (let i = 0; i < frames; i++) {
      interleaved[i * 2] = left[i] ?? 0;
      interleaved[i * 2 + 1] = right[i] ?? 0;
    }
  }
  return { interleaved, frames };
}

/**
 * Decode source bytes to stereo PCM.
 * Unsupported / corrupt → SOURCE_DECODE (no silent fake PCM).
 */
export async function decodeRenderSourceToStereoPcm(params: {
  bytes: Uint8Array;
  contentType: string | null;
  label: "take" | "beat";
}): Promise<DecodedPcmStereo> {
  if (!params.bytes.byteLength) {
    throw new RenderJobDomainError(
      `${params.label} source is empty.`,
      "INVALID",
    );
  }

  try {
    const audio = await decodeAudio(
      Buffer.from(
        params.bytes.buffer,
        params.bytes.byteOffset,
        params.bytes.byteLength,
      ),
    );
    const sampleRate = audio.sampleRate;
    const channelData = audio.channelData as Float32Array[] | undefined;
    if (
      typeof sampleRate !== "number" ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0 ||
      !channelData?.length
    ) {
      throw new RenderJobDomainError(
        `${params.label} decode produced invalid PCM.`,
        "INVALID",
      );
    }
    const { interleaved, frames } = toStereoInterleaved(channelData);
    return { sampleRate, channels: 2, interleaved, frames };
  } catch (error) {
    if (error instanceof RenderJobDomainError) throw error;
    throw new RenderJobDomainError(
      `${params.label} SOURCE_DECODE: ${
        error instanceof Error ? error.message : "decode failed"
      }`,
      "INVALID",
    );
  }
}

/** Map DOMAIN INVALID decode failures to stable worker error_code. */
export function renderDecodeErrorCode(error: unknown): string {
  if (
    error instanceof RenderJobDomainError &&
    error.message.includes("SOURCE_DECODE")
  ) {
    return "SOURCE_DECODE";
  }
  if (error instanceof RenderJobDomainError && error.code === "INVALID") {
    return "SOURCE_DECODE";
  }
  return "SOURCE_DECODE";
}
