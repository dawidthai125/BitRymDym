import type { Beat, BeatStatus } from "@/types/domain";
import { toUserFacingError } from "@/lib/ui/user-errors";

/** Public catalog / detail visibility — PUBLISHED only. */
export function isPubliclyVisibleBeatStatus(status: BeatStatus): boolean {
  return status === "PUBLISHED";
}

export function filterPublicCatalog(beats: readonly Beat[]): Beat[] {
  return beats.filter((beat) => isPubliclyVisibleBeatStatus(beat.status));
}

export type PublicBeatCatalogItem = {
  id: string;
  title: string;
  producer: string | null;
  genre: string | null;
  style: string | null;
  bpm: number;
  key: string | null;
  scale: string | null;
  durationSeconds: number;
  coverRef: string | null;
};

export type PublicBeatDetail = PublicBeatCatalogItem & {
  description: string | null;
};

export function toPublicCatalogItem(beat: Beat): PublicBeatCatalogItem {
  return {
    id: beat.id,
    title: beat.title,
    producer: beat.producer,
    genre: beat.genre,
    style: beat.style,
    bpm: beat.bpm,
    key: beat.key,
    scale: beat.scale,
    durationSeconds: beat.durationSeconds,
    coverRef: beat.coverRef,
  };
}

export function toPublicBeatDetail(beat: Beat): PublicBeatDetail {
  return {
    ...toPublicCatalogItem(beat),
    description: beat.description,
  };
}

export function formatDurationSeconds(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds)
    ? Math.max(0, Math.floor(totalSeconds))
    : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Safe user-facing playback errors — no SQL / Storage / service-role leakage. */
export function toSafePlaybackErrorMessage(
  raw: string | null | undefined,
): string {
  return toUserFacingError(raw, "playback");
}

/** Safe user-facing download errors — no permissions / SQL / Storage leakage. */
export function toSafeDownloadErrorMessage(
  raw: string | null | undefined,
): string {
  if (!raw) {
    return toUserFacingError(raw, "download");
  }
  const lower = String(raw).toLowerCase();
  // P0 — PLATFORM original master never downloadable (not a transient failure).
  if (
    lower.includes("original platform beat download") ||
    lower.includes("platform beat download is not available")
  ) {
    return "Pobieranie oryginalnego bitu jest niedostępne.";
  }
  // Preserve prior download-domain breadth for bare "limit reached".
  if (lower.includes("limit reached") && !lower.includes("render")) {
    return "Osiągnięto dzienny limit pobrań. Spróbuj ponownie jutro.";
  }
  return toUserFacingError(raw, "download");
}

/** PlaybackShell / catalog must use PLAYBACK only. */
export const PUBLIC_PLAYBACK_PURPOSE = "PLAYBACK" as const;
/** Dedicated Download CTA on beat detail (Phase 1.8A). */
export const PUBLIC_DOWNLOAD_PURPOSE = "DOWNLOAD" as const;
/**
 * Surfaces that must not issue DOWNLOAD (PlaybackShell, catalog).
 * Beat detail Download CTA is the sole public DOWNLOAD entry.
 */
export const PUBLIC_UI_FORBIDDEN_PURPOSES = ["DOWNLOAD"] as const;
