import "server-only";

/**
 * Gold YouTube video — own graphic: the same input checks + Gemini content filter as
 * beat covers, but the aspect ratio is kept (no square crop): the video frame fits the
 * image on a blurred fill. Metadata (EXIF / GPS) is dropped by the re-encode.
 */
import sharp from "sharp";

import { assertCoverLikeImage, type CoverLikeCopy } from "@/lib/beats/cover/cover-image";
import { moderateCoverImage } from "@/lib/beats/cover/cover-moderation";
import type { CoverModerationOutcome } from "@/lib/beats/cover/cover-decision";
import { BeatRequestError } from "@/lib/beats/request-error";

import { YT_VIDEO_IMAGE_MAX_PX } from "./youtube-video";

export const VIDEO_IMAGE_COPY: CoverLikeCopy = {
  empty: "Plik grafiki jest pusty.",
  tooBig: "Grafika może mieć maksymalnie 4 MB.",
  tooSmall: "Grafika musi mieć co najmniej 300×300 px.",
  tooLarge: "Grafika jest zbyt duża (maks. 8000 px).",
  failed: "Nie udało się przetworzyć grafiki.",
};

export const VIDEO_IMAGE_REJECTED_MESSAGE = "Grafika nie przeszła automatycznego filtra treści. Wybierz inny obraz.";
/** No moderator queue for video graphics: anything not clearly fine is refused (never auto-approved). */
export const VIDEO_IMAGE_REVIEW_MESSAGE = "Tej grafiki nie mogę automatycznie zatwierdzić. Wybierz inną albo użyj okładki bitu.";
export const VIDEO_IMAGE_FILTER_DOWN_MESSAGE = "Nie mogę teraz sprawdzić grafiki. Spróbuj za chwilę albo użyj okładki bitu.";

export type ProcessedVideoImage = { image: Buffer; width: number; height: number; moderationPreview: Buffer };

export async function processVideoImage(input: Uint8Array): Promise<ProcessedVideoImage> {
  await assertCoverLikeImage(input, VIDEO_IMAGE_COPY);
  const base = () => sharp(input, { limitInputPixels: 64_000_000 }).rotate().flatten({ background: "#111111" });
  try {
    const [{ data, info }, moderationPreview] = await Promise.all([
      base().resize(YT_VIDEO_IMAGE_MAX_PX, YT_VIDEO_IMAGE_MAX_PX, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true }),
      base().resize(512, 512, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer(),
    ]);
    return { image: data, width: info.width, height: info.height, moderationPreview };
  } catch {
    throw new BeatRequestError(VIDEO_IMAGE_COPY.failed);
  }
}

/** approve → ok; reject → filter message; review / filter unavailable → refused (no queue). */
export function videoImageVerdict(m: CoverModerationOutcome): { ok: true } | { ok: false; message: string } {
  if (m.decision === "approve") return { ok: true };
  if (m.decision === "reject") return { ok: false, message: VIDEO_IMAGE_REJECTED_MESSAGE };
  if (m.skippedReason) return { ok: false, message: VIDEO_IMAGE_FILTER_DOWN_MESSAGE };
  return { ok: false, message: VIDEO_IMAGE_REVIEW_MESSAGE };
}

export async function filterVideoImage(input: Uint8Array): Promise<ProcessedVideoImage> {
  const processed = await processVideoImage(input);
  const v = videoImageVerdict(await moderateCoverImage(processed.moderationPreview));
  if (!v.ok) throw new BeatRequestError(v.message);
  return processed;
}
