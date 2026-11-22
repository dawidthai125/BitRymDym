/**
 * Take-expiry e-mail (2026-11-22): which owners get a mail and about which project. Pure.
 * One mail per owner per run: the project whose take expires first. Every listed take is
 * claimed (expiry_notified_at) so an owner is never mailed twice for the same take.
 */

/** Cron runs once a day; 36 h catches every take at least once before expiry (retention ≥ 2 days). */
export const TAKE_EXPIRY_NOTICE_WINDOW_MS = 36 * 60 * 60 * 1000;

/** Upper bound on candidate takes scanned per run (paged by expires_at, id). */
export const TAKE_EXPIRY_CANDIDATE_CAP = 2000;

/** Split ids into chunks (keeps PostgREST `.in()` URLs bounded). */
export function chunkIds<T>(ids: readonly T[], size: number): T[][] {
  const n = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n));
  return out;
}

export type TakeExpiryCandidate = { takeId: string; ownerId: string; expiresAt: string };
export type TakeProjectLink = { takeId: string; projectId: string; projectTitle: string; projectOwnerId: string };
export type TakeExpiryMail = { ownerId: string; projectId: string; projectTitle: string; expiresAt: string; takeIds: string[]; otherProjects: number };

export function planTakeExpiryMails(candidates: readonly TakeExpiryCandidate[], links: readonly TakeProjectLink[]): TakeExpiryMail[] {
  const byTake = new Map<string, TakeProjectLink[]>();
  for (const l of links) byTake.set(l.takeId, [...(byTake.get(l.takeId) ?? []), l]);
  const perOwner = new Map<string, { takes: Set<string>; projects: Map<string, { title: string; at: number }> }>();
  for (const c of candidates) {
    const at = Date.parse(c.expiresAt);
    if (!Number.isFinite(at)) continue;
    // Only takes used in the owner's own project count (a clip is the signal that the take matters).
    const own = (byTake.get(c.takeId) ?? []).filter((l) => l.projectOwnerId === c.ownerId);
    if (own.length === 0) continue;
    const o = perOwner.get(c.ownerId) ?? { takes: new Set<string>(), projects: new Map() };
    o.takes.add(c.takeId);
    for (const l of own) {
      const cur = o.projects.get(l.projectId);
      if (!cur || at < cur.at) o.projects.set(l.projectId, { title: l.projectTitle, at });
    }
    perOwner.set(c.ownerId, o);
  }
  const out: TakeExpiryMail[] = [];
  for (const [ownerId, o] of perOwner) {
    const [first] = [...o.projects.entries()].sort((a, b) => a[1].at - b[1].at);
    if (!first) continue;
    out.push({
      ownerId,
      projectId: first[0],
      projectTitle: first[1].title,
      expiresAt: new Date(first[1].at).toISOString(),
      takeIds: [...o.takes].sort(),
      otherProjects: o.projects.size - 1,
    });
  }
  return out.sort((a, b) => a.ownerId.localeCompare(b.ownerId));
}

/** "jutro (23 listopada) o 08:54" style text in Polish time. */
export function formatTakeExpiryWhen(expiresAt: string, now = Date.now()): string {
  const d = new Date(expiresAt);
  const tz = "Europe/Warsaw";
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(x);
  const date = new Intl.DateTimeFormat("pl-PL", { timeZone: tz, day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("pl-PL", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(d);
  const today = day(new Date(now));
  const tomorrow = day(new Date(now + 24 * 3600_000));
  const prefix = day(d) === today ? "dziś" : day(d) === tomorrow ? "jutro" : null;
  return prefix ? `${prefix} (${date}) o ${time}` : `${date} o ${time}`;
}
