/**
 * Plan-expiry e-mail (2026-11-22): which paid plans get a "kończy się za 3 dni" mail. Pure.
 * The daily cron looks at plans ending between now+2 d and now+3 d, so each end date is hit by one run.
 * plan_expiry_notified_for stores the warned expires_at: an extension (new date) can be warned again.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const PLAN_EXPIRY_WINDOW_FROM_MS = 2 * DAY_MS;
export const PLAN_EXPIRY_WINDOW_TO_MS = 3 * DAY_MS;

/** Upper bound on entitlements scanned per run. */
export const PLAN_EXPIRY_CANDIDATE_CAP = 2000;

export type PlanExpiryCandidate = {
  id: string;
  userId: string;
  tier: string;
  source: string;
  active: boolean;
  expiresAt: string | null;
  pendingTier: string | null;
  notifiedFor: string | null;
};
export type PlanExpiryMail = { entitlementId: string; userId: string; expiresAt: string };

export function planExpiryWindow(now: number): { from: string; to: string } {
  return { from: new Date(now + PLAN_EXPIRY_WINDOW_FROM_MS).toISOString(), to: new Date(now + PLAN_EXPIRY_WINDOW_TO_MS).toISOString() };
}

export function planPlanExpiryMails(candidates: readonly PlanExpiryCandidate[], now: number): PlanExpiryMail[] {
  const out: PlanExpiryMail[] = [];
  for (const c of candidates) {
    if (!c.active || c.tier === "FREE" || c.source !== "purchase" || c.pendingTier) continue;
    const at = c.expiresAt ? Date.parse(c.expiresAt) : NaN;
    if (!Number.isFinite(at)) continue;
    // Window (now+2 d, now+3 d]: consecutive daily runs never overlap.
    if (at <= now + PLAN_EXPIRY_WINDOW_FROM_MS || at > now + PLAN_EXPIRY_WINDOW_TO_MS) continue;
    const warned = c.notifiedFor ? Date.parse(c.notifiedFor) : NaN;
    if (warned === at) continue;
    // Raw DB value (keeps microseconds) so the claim can match expires_at exactly.
    out.push({ entitlementId: c.id, userId: c.userId, expiresAt: c.expiresAt as string });
  }
  return out.sort((a, b) => a.userId.localeCompare(b.userId));
}

/** "25 listopada o 10:00" (pl) / "25 November at 10:00" (en), in Polish time. */
export function formatPlanExpiryDate(expiresAt: string, locale: "pl" | "en" = "pl"): string {
  const d = new Date(expiresAt);
  const tz = "Europe/Warsaw";
  const tag = locale === "en" ? "en-GB" : "pl-PL";
  const date = new Intl.DateTimeFormat(tag, { timeZone: tz, day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat(tag, { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return locale === "en" ? `${date} at ${time}` : `${date} o ${time}`;
}
