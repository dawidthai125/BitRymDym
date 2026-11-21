/**
 * Recording expiry notice for a Studio project (2026-11-22).
 * Takes expire after the plan's retention; the owner only found out at WAV export
 * ("To nagranie wygasło"). The project page now warns before and after expiry.
 * Pure: no database. The loader lives in studio-take-expiry-server.ts.
 */

/** Warn when the soonest take expires within this window. */
export const STUDIO_TAKE_EXPIRY_WARN_MS = 3 * 24 * 60 * 60 * 1000;

export type StudioTakeExpiryRow = {
  id: string;
  status: string;
  expiresAt: string | null;
  deletedAt: string | null;
};

export type StudioTakeExpiryNotice =
  | { kind: "none" }
  | { kind: "expired"; count: number }
  | { kind: "soon"; count: number; expiresAt: string; hoursLeft: number };

function isGone(row: StudioTakeExpiryRow, now: number): boolean {
  if (row.deletedAt || row.status === "DELETED" || row.status === "EXPIRED") return true;
  if (!row.expiresAt) return false;
  const t = Date.parse(row.expiresAt);
  return Number.isFinite(t) && t <= now;
}

/**
 * Expired takes win over "soon": the project can no longer be exported as it stands.
 * `takeIds` are the takes used by clips; a take missing from `rows` counts as expired
 * (purged by cleanup).
 */
export function studioTakeExpiryNotice(
  takeIds: readonly string[],
  rows: readonly StudioTakeExpiryRow[],
  now = Date.now(),
): StudioTakeExpiryNotice {
  const unique = [...new Set(takeIds.filter(Boolean))];
  if (unique.length === 0) return { kind: "none" };
  const byId = new Map(rows.map((r) => [r.id, r]));
  let expired = 0;
  let soonCount = 0;
  let soonest: number | null = null;
  for (const id of unique) {
    const row = byId.get(id);
    if (!row || isGone(row, now)) {
      expired += 1;
      continue;
    }
    if (!row.expiresAt) continue;
    const t = Date.parse(row.expiresAt);
    if (!Number.isFinite(t) || t - now > STUDIO_TAKE_EXPIRY_WARN_MS) continue;
    soonCount += 1;
    if (soonest === null || t < soonest) soonest = t;
  }
  if (expired > 0) return { kind: "expired", count: expired };
  if (soonest !== null) {
    return {
      kind: "soon",
      count: soonCount,
      expiresAt: new Date(soonest).toISOString(),
      hoursLeft: Math.max(1, Math.floor((soonest - now) / 3_600_000)),
    };
  }
  return { kind: "none" };
}

export function studioClipTakeIds(clips: readonly { sourceKind: string; sourceTakeId: string | null }[]): string[] {
  return clips.filter((c) => c.sourceKind === "TAKE" && c.sourceTakeId).map((c) => c.sourceTakeId as string);
}
