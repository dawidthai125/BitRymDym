import type { Beat, BeatStatus } from "@/types/domain";

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
  if (!raw) {
    return "Nie udało się odtworzyć audio.";
  }
  const lower = raw.toLowerCase();
  if (
    lower.includes("forbidden") ||
    lower.includes("denied") ||
    lower.includes("unauthorized") ||
    lower.includes("unauthenticated")
  ) {
    return "Brak dostępu do odsłuchu.";
  }
  if (
    lower.includes("not found") ||
    lower.includes("no ready") ||
    lower.includes("missing")
  ) {
    return "Audio niedostępne dla tego bitu.";
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("failed to fetch")
  ) {
    return "Błąd sieci. Spróbuj ponownie.";
  }
  if (
    lower.includes("signed") ||
    lower.includes("url") ||
    lower.includes("expired")
  ) {
    return "Sesja odtwarzania wygasła. Spróbuj ponownie.";
  }
  return "Nie udało się odtworzyć audio.";
}

/** Phase 1.6 hard-out: UI must never request DOWNLOAD purpose. */
export const PUBLIC_PLAYBACK_PURPOSE = "PLAYBACK" as const;
export const PUBLIC_UI_FORBIDDEN_PURPOSES = ["DOWNLOAD"] as const;
