import "server-only";

import sharp from "sharp";

import {
  BEAT_COVER_ACCEPTED_MIME,
  BEAT_COVER_FULL_PX,
  BEAT_COVER_MAX_EDGE_PX,
  BEAT_COVER_MAX_INPUT_BYTES,
  BEAT_COVER_MIN_EDGE_PX,
  BEAT_COVER_THUMB_PX,
} from "@/config/beat-covers";
import { BeatRequestError } from "@/lib/beats/request-error";

export type ProcessedCover = {
  full: Buffer;
  thumb: Buffer;
  /** Small JPEG only for the content filter (never stored). */
  moderationPreview: Buffer;
};

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Validate by decoded content (not the client MIME), auto-orient, centre-crop
 * to a square and re-encode. sharp drops all metadata (EXIF / GPS / ICC
 * comments) unless `withMetadata` is called — it never is here.
 */
export async function processCoverImage(input: Uint8Array): Promise<ProcessedCover> {
  if (input.byteLength === 0) {
    throw new BeatRequestError("Plik okładki jest pusty.");
  }
  if (input.byteLength > BEAT_COVER_MAX_INPUT_BYTES) {
    throw new BeatRequestError("Okładka może mieć maksymalnie 4 MB.");
  }
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(input, { limitInputPixels: 64_000_000 }).metadata();
  } catch {
    throw new BeatRequestError("To nie jest poprawny obraz (JPG, PNG lub WebP).");
  }
  const mime = meta.format ? FORMAT_TO_MIME[meta.format] : undefined;
  if (!mime || !(BEAT_COVER_ACCEPTED_MIME as readonly string[]).includes(mime)) {
    throw new BeatRequestError("To nie jest poprawny obraz (JPG, PNG lub WebP).");
  }
  if ((meta.pages ?? 1) > 1) {
    throw new BeatRequestError("Animowane obrazy nie są obsługiwane.");
  }
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (Math.min(w, h) < BEAT_COVER_MIN_EDGE_PX) {
    throw new BeatRequestError("Okładka musi mieć co najmniej 300×300 px.");
  }
  if (Math.max(w, h) > BEAT_COVER_MAX_EDGE_PX) {
    throw new BeatRequestError("Okładka jest zbyt duża (maks. 8000 px).");
  }

  const base = () =>
    sharp(input, { limitInputPixels: 64_000_000 }).rotate().flatten({
      background: "#111111",
    });
  try {
    const [full, thumb, moderationPreview] = await Promise.all([
      base()
        .resize(BEAT_COVER_FULL_PX, BEAT_COVER_FULL_PX, {
          fit: "cover",
          withoutEnlargement: false,
        })
        .webp({ quality: 82 })
        .toBuffer(),
      base()
        .resize(BEAT_COVER_THUMB_PX, BEAT_COVER_THUMB_PX, { fit: "cover" })
        .webp({ quality: 78 })
        .toBuffer(),
      base()
        .resize(512, 512, { fit: "inside" })
        .jpeg({ quality: 80 })
        .toBuffer(),
    ]);
    return { full, thumb, moderationPreview };
  } catch {
    throw new BeatRequestError("Nie udało się przetworzyć okładki.");
  }
}
