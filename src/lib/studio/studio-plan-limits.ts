/**
 * Plan limits for Studio (pure, no I/O). Numbers come from `@/config/plan-policy`;
 * the server calls these before writing, the UI only mirrors the result.
 */

import { maxProjectsForTier, mastersPerMonthForTier } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

export const PROJECT_LIMIT_REACHED = "PROJECT_LIMIT_REACHED" as const;

export class StudioProjectLimitError extends Error {
  readonly code = PROJECT_LIMIT_REACHED;
  readonly limit: number;
  readonly tier: PremiumTier;

  constructor(tier: PremiumTier, limit: number) {
    super(`Osiągnięto limit ${limit} projektów Studio w planie ${tier}.`);
    this.name = "StudioProjectLimitError";
    this.limit = limit;
    this.tier = tier;
  }
}

/**
 * New project allowed only below the plan cap. Existing projects above the cap
 * (e.g. after a downgrade) stay readable and editable — only creating is blocked.
 */
export function canCreateStudioProject(params: { tier: PremiumTier; activeProjects: number }): boolean {
  const n = Number.isFinite(params.activeProjects) ? Math.max(0, Math.floor(params.activeProjects)) : 0;
  return n < maxProjectsForTier(params.tier);
}

/** Calendar month in Europe/Warsaw: [start, next start) as ISO strings. */
export function warsawMonthWindow(now: Date): { startIso: string; resetIso: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit" }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const startOf = (yy: number, mm: number) => {
    // Midnight Warsaw = 22:00/23:00 UTC of the previous day; find the offset for that instant.
    const guess = Date.UTC(yy, mm - 1, 1, 0, 0, 0);
    const off = warsawOffsetMinutes(new Date(guess));
    return new Date(guess - off * 60_000);
  };
  const start = startOf(y, m);
  const reset = m === 12 ? startOf(y + 1, 1) : startOf(y, m + 1);
  return { startIso: start.toISOString(), resetIso: reset.toISOString() };
}

function warsawOffsetMinutes(at: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Warsaw", timeZoneName: "shortOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(s);
  if (!m) return 60;
  const v = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -v : v;
}

export type MasterQuota = { used: number; monthLimit: number; resetAt: string };

export function masterQuotaLeft(q: MasterQuota): number {
  return Math.max(0, q.monthLimit - q.used);
}

export function monthlyMasterLimit(tier: PremiumTier): number {
  return mastersPerMonthForTier(tier);
}
