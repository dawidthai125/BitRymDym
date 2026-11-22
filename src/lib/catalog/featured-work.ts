/**
 * "Utwór tygodnia" (pure). One featured catalogue work per Europe/Warsaw week (Monday start).
 * Storage: public.featured_works (service_role only); visibility is re-checked against the live
 * catalogue on every read, so a withdrawn work disappears from the home page at once.
 */
import { COMMUNITY_ZONE, warsawPeriod } from "@/lib/community/ranking-policy";

export const FEATURED_NOTE_MAX = 280;

/** Monday of the Warsaw week containing `now`, as `YYYY-MM-DD` (the `week_start` column). */
export function warsawWeekStart(now: Date, timeZone = COMMUNITY_ZONE): string {
  const start = warsawPeriod(now, "week", timeZone).start;
  const bag: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start)) {
    bag[part.type] = part.value;
  }
  return `${bag.year}-${bag.month}-${bag.day}`;
}

/** Admin note: single line, trimmed, capped; empty → null. */
export function cleanFeaturedNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const note = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, FEATURED_NOTE_MAX).trim();
  return note || null;
}

export type FeaturedRowLike = { workId: string; weekStart: string };

/**
 * Show the section only when the row is for the current Warsaw week AND the same work is still
 * live in the catalogue (`live` = findLiveCatalogWork result, null when withdrawn / unknown).
 */
export function shouldShowFeatured(
  row: FeaturedRowLike | null | undefined,
  live: { id: string } | null | undefined,
  now: Date,
): boolean {
  if (!row || !live) return false;
  if (row.weekStart !== warsawWeekStart(now)) return false;
  return live.id === row.workId;
}
