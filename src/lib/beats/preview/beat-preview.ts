/**
 * Guest 20 s beat preview asset (pure helpers, no IO).
 *
 * Guests must never get a signed URL to the full beat file. Each published
 * beat gets a short MP3 rendered from its active MASTER and stored as a
 * `beat_audio_assets` row with purpose PREVIEW, under the canonical private
 * key layout (platform/... or user/{ownerId}/...; `.bin`, bucket beat-audio).
 */
import { GUEST_POLICY } from "@/config/plan-policy";
import {
  buildBeatAudioObjectKey,
  buildUserBeatAudioObjectKey,
} from "@/lib/beats/audio-validation";
import type { BeatOwnershipType } from "@/types/domain";

export const BEAT_PREVIEW_SECONDS = GUEST_POLICY.previewSeconds;
export const BEAT_PREVIEW_FADE_SECONDS = 1.5;
export const BEAT_PREVIEW_BITRATE = "128k";
export const BEAT_PREVIEW_CONTENT_TYPE = "audio/mpeg";

/**
 * Provenance marker kept in original_filename: ties a preview to the exact
 * MASTER asset it was cut from, so a replaced master makes the preview stale.
 */
export function previewSourceMarker(masterAssetId: string): string {
  return `preview-${BEAT_PREVIEW_SECONDS}s-of-${masterAssetId}.mp3`;
}

export function isPreviewFresh(params: {
  preview: { original_filename: string | null; status: string; is_active: boolean } | null;
  masterAssetId: string;
}): boolean {
  const p = params.preview;
  return Boolean(
    p &&
      p.is_active &&
      p.status === "READY" &&
      p.original_filename === previewSourceMarker(params.masterAssetId),
  );
}

export function buildPreviewObjectKey(params: {
  ownershipType: BeatOwnershipType;
  ownerId: string | null;
  beatId: string;
  assetId: string;
}): string {
  if (params.ownershipType === "PLATFORM") {
    return buildBeatAudioObjectKey({
      beatId: params.beatId,
      assetId: params.assetId,
      purpose: "PREVIEW",
    });
  }
  if (!params.ownerId) {
    throw new Error("preview_owner_missing");
  }
  return buildUserBeatAudioObjectKey({
    ownerId: params.ownerId,
    beatId: params.beatId,
    assetId: params.assetId,
    purpose: "PREVIEW",
  });
}

/** ffmpeg: first N s, short fade-out, stereo 44.1 kHz MP3 CBR, no metadata. */
export function buildPreviewFfmpegArgs(params: {
  input: string;
  output: string;
  seconds?: number;
  fadeSeconds?: number;
  sourceDurationSeconds?: number | null;
}): string[] {
  const seconds = params.seconds ?? BEAT_PREVIEW_SECONDS;
  const fade = params.fadeSeconds ?? BEAT_PREVIEW_FADE_SECONDS;
  const src = params.sourceDurationSeconds;
  const length =
    typeof src === "number" && Number.isFinite(src) && src > 0
      ? Math.min(seconds, src)
      : seconds;
  const fadeStart = Math.max(0, length - fade);
  return [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-i",
    params.input,
    "-t",
    String(length),
    "-af",
    `afade=t=out:st=${fadeStart.toFixed(3)}:d=${Math.min(fade, length).toFixed(3)}`,
    "-ac",
    "2",
    "-ar",
    "44100",
    "-map_metadata",
    "-1",
    "-vn",
    "-c:a",
    "libmp3lame",
    "-b:a",
    BEAT_PREVIEW_BITRATE,
    "-f",
    "mp3",
    params.output,
  ];
}
