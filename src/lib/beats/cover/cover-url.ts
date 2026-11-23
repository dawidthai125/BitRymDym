/**
 * User beats 2026-10-30 — cover URL (pure, client-safe).
 * Only approved covers are shown publicly; `v` busts caches on replace.
 */
import type { BeatCoverStatus } from "@/types/domain";

export function beatCoverUrl(
  beat: {
    id: string;
    coverStatus?: BeatCoverStatus | null;
    coverUpdatedAt?: string | null;
  },
  size: "thumb" | "full" = "thumb",
  options?: { includeUnapproved?: boolean },
): string | null {
  const status = beat.coverStatus ?? "none";
  if (status === "none") return null;
  if (status !== "approved" && !options?.includeUnapproved) return null;
  const v = beat.coverUpdatedAt ? Date.parse(beat.coverUpdatedAt) || 0 : 0;
  return `/api/beats/${beat.id}/cover?s=${size}&v=${v}`;
}

/** Same cover at the small list size (`s=mini`); other URLs pass through. */
export function beatCoverMiniUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/api/beats/") ? url.replace("?s=thumb", "?s=mini") : url;
}
