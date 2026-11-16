/**
 * Admin Contabo convert: full-length clean MP3 from PLATFORM MASTER (WAV).
 * Stored as purpose DOWNLOAD with a provenance marker — not a user download.
 */
import { buildBeatAudioObjectKey } from "@/lib/beats/audio-validation";

export const OPS_MP3_WANTED_TAG = "ops-mp3-wanted";
export const OPS_MP3_BITRATE = "192k";
export const OPS_MP3_CONTENT_TYPE = "audio/mpeg";

export function opsMp3SourceMarker(masterAssetId: string): string {
  return `ops-mp3-of-${masterAssetId}.mp3`;
}

export function isOpsMp3Filename(originalFilename: string | null | undefined): boolean {
  return Boolean(originalFilename && /^ops-mp3-of-.+\.mp3$/i.test(originalFilename));
}

export function isOpsMp3Fresh(params: {
  asset: { original_filename: string | null; status: string; is_active: boolean } | null;
  masterAssetId: string;
}): boolean {
  const a = params.asset;
  return Boolean(
    a &&
      a.is_active &&
      a.status === "READY" &&
      a.original_filename === opsMp3SourceMarker(params.masterAssetId),
  );
}

export function buildOpsMp3ObjectKey(params: { beatId: string; assetId: string }): string {
  return buildBeatAudioObjectKey({
    beatId: params.beatId,
    assetId: params.assetId,
    purpose: "DOWNLOAD",
  });
}

/** ffmpeg: full file → stereo 44.1 kHz MP3 CBR, no metadata, no fade. */
export function buildOpsMp3FfmpegArgs(params: { input: string; output: string }): string[] {
  return [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-i",
    params.input,
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
    OPS_MP3_BITRATE,
    "-f",
    "mp3",
    params.output,
  ];
}

export function tagsWithOpsMp3Wanted(tags: unknown): string[] {
  const list = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string")
    : [];
  if (list.includes(OPS_MP3_WANTED_TAG)) return list;
  return [...list, OPS_MP3_WANTED_TAG];
}

export function tagsWithoutOpsMp3Wanted(tags: unknown): string[] {
  const list = Array.isArray(tags)
    ? tags.filter((t): t is string => typeof t === "string")
    : [];
  return list.filter((t) => t !== OPS_MP3_WANTED_TAG);
}
