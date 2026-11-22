/**
 * "Nic jeszcze nie nagrałeś" e-mail (2026-11-22): which new accounts get the one-time nudge. Pure.
 * Account 3–10 days old, confirmed e-mail, not staff, no own recording and no Studio project,
 * Studio mails on, never nudged. The 10-day cap keeps old accounts out (no mass mail on rollout).
 * notification_preferences.no_recording_nudge_sent_at is the one-shot claim.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const NO_RECORDING_MIN_AGE_MS = 3 * DAY_MS;
export const NO_RECORDING_MAX_AGE_MS = 10 * DAY_MS;

/** Mails sent per cron run (the rest waits for the next day; the 10-day cap still applies). */
export const NO_RECORDING_MAILS_PER_RUN = 50;

/** Upper bound on accounts scanned per run. */
export const NO_RECORDING_CANDIDATE_CAP = 2000;

const STAFF_ROLES = new Set(["ADMIN", "MODERATOR"]);

export type NoRecordingCandidate = {
  userId: string;
  createdAt: string;
  emailConfirmed: boolean;
  role: string;
  hasTake: boolean;
  hasProject: boolean;
  studioMailOn: boolean;
  nudgeSentAt: string | null;
};

/** Sign-up window (created_at): (now − 10 d, now − 3 d]. */
export function noRecordingWindow(now: number): { createdAfter: string; createdBefore: string } {
  return { createdAfter: new Date(now - NO_RECORDING_MAX_AGE_MS).toISOString(), createdBefore: new Date(now - NO_RECORDING_MIN_AGE_MS).toISOString() };
}

/** User ids to mail this run, oldest account first (closest to the 10-day cap), capped. */
export function planNoRecordingMails(candidates: readonly NoRecordingCandidate[], now: number, cap = NO_RECORDING_MAILS_PER_RUN): string[] {
  const picked: { userId: string; at: number }[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (seen.has(c.userId)) continue;
    const at = Date.parse(c.createdAt);
    if (!Number.isFinite(at)) continue;
    const age = now - at;
    if (age < NO_RECORDING_MIN_AGE_MS || age >= NO_RECORDING_MAX_AGE_MS) continue;
    if (!c.emailConfirmed || STAFF_ROLES.has(c.role.toUpperCase())) continue;
    if (c.hasTake || c.hasProject || !c.studioMailOn || c.nudgeSentAt) continue;
    seen.add(c.userId);
    picked.push({ userId: c.userId, at });
  }
  picked.sort((a, b) => a.at - b.at || a.userId.localeCompare(b.userId));
  return picked.slice(0, Math.max(0, Math.floor(cap))).map((p) => p.userId);
}
