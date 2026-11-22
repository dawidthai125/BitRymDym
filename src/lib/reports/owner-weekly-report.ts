/**
 * Weekly owner report (2026-11-22): periods, recipients and the mail body. Pure.
 * Sent by the daily cron on Mondays (Europe/Warsaw). Covers the last full week
 * Mon 00:00 – Mon 00:00 Warsaw time vs the week before. Aggregates only, no personal data.
 */
import { escapeHtml } from "@/lib/email/html-escape";
import { funnelSteps } from "@/lib/funnel/funnel-math";

const TZ = "Europe/Warsaw";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function warsawParts(at: number) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { y: Number(get("year")), m: Number(get("month")), d: Number(get("day")), h: Number(get("hour")), mi: Number(get("minute")), s: Number(get("second")), weekday: get("weekday") };
}

function warsawOffsetMs(at: number): number {
  const p = warsawParts(at);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(at / 1000) * 1000;
}

/** Warsaw calendar date "YYYY-MM-DD" of the instant. */
export function warsawDateKey(now: number): string {
  const p = warsawParts(now);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** True on Monday in Warsaw time. */
export function isWarsawMonday(now: number): boolean {
  return warsawParts(now).weekday === "Mon";
}

/** UTC instant of 00:00 Warsaw time on the instant's Warsaw date (DST-safe: changes happen at 2–3 a.m.). */
export function warsawMidnight(now: number): number {
  const p = warsawParts(now);
  const guess = Date.UTC(p.y, p.m - 1, p.d);
  const first = guess - warsawOffsetMs(guess);
  return guess - warsawOffsetMs(first);
}

export type ReportPeriod = { from: string; to: string };
export type WeeklyReportPeriods = { key: string; current: ReportPeriod; previous: ReportPeriod };

/** key = Warsaw date of the run (dedupe), current = last 7 Warsaw days, previous = the 7 before. */
export function weeklyReportPeriods(now: number): WeeklyReportPeriods {
  const end = warsawMidnight(now);
  // A week back can cross a DST change; re-anchor each boundary to Warsaw midnight.
  const start = warsawMidnight(end - WEEK_MS + 12 * 3600_000);
  const prevStart = warsawMidnight(start - WEEK_MS + 12 * 3600_000);
  const iso = (ms: number) => new Date(ms).toISOString();
  return { key: warsawDateKey(now), current: { from: iso(start), to: iso(end) }, previous: { from: iso(prevStart), to: iso(start) } };
}

/** Owner address(es) from OWNER_REPORT_EMAIL (comma separated, max 3). Never hard-coded. */
export function parseReportRecipients(value: string | undefined): string[] {
  const out: string[] = [];
  for (const raw of (value ?? "").split(",")) {
    const a = raw.trim();
    if (!a || a.length > 254 || /[\s<>"',;]/.test(a) || !/^[^@]+@[^@]+\.[^@]+$/.test(a)) continue;
    if (!out.includes(a.toLowerCase())) out.push(a.toLowerCase());
  }
  return out.slice(0, 3);
}

export const WEEKLY_STAT_KEYS = [
  "new_accounts",
  "orders_started",
  "payments_count",
  "payments_grosz",
  "refunds_count",
  "refunds_grosz",
  "active_recorders",
  "new_takes",
  "masters_done",
  "videos_done",
  "works_published",
  "failed_master",
  "failed_video",
  "failed_export",
  "failed_separate",
  "failed_cleanup",
  "failed_render",
  "nudges_sent",
] as const;
export type WeeklyStatKey = (typeof WEEKLY_STAT_KEYS)[number];
export type WeeklyStats = Record<WeeklyStatKey, number> & { funnel: Record<string, number> };

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

/** Normalises the owner_weekly_report_stats() jsonb (missing/garbage → 0). */
export function parseWeeklyStats(raw: unknown): WeeklyStats {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const stats = Object.fromEntries(WEEKLY_STAT_KEYS.map((k) => [k, num(o[k])])) as Record<WeeklyStatKey, number>;
  const funnelRaw = o.funnel && typeof o.funnel === "object" ? (o.funnel as Record<string, unknown>) : {};
  const funnel = Object.fromEntries(Object.entries(funnelRaw).map(([k, v]) => [k, num(v)]));
  return { ...stats, funnel };
}

export function formatZloty(grosz: number): string {
  const s = (Math.max(0, Math.round(grosz)) / 100).toFixed(2).replace(".", ",");
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, " ")} zł`;
}

function delta(cur: number, prev: number): string {
  const d = cur - prev;
  return d === 0 ? "bez zmian" : d > 0 ? `+${d}` : `${d}`;
}

function warsawDay(iso: string): string {
  return new Intl.DateTimeFormat("pl-PL", { timeZone: TZ, day: "numeric", month: "long" }).format(new Date(iso));
}

type Row = { label: string; cur: string; prev: string; change: string };

function row(label: string, cur: number, prev: number, fmt: (n: number) => string = String): Row {
  return { label, cur: fmt(cur), prev: fmt(prev), change: delta(cur, prev) };
}

function pct(v: number | null): string {
  return v === null ? "–" : `${String(v).replace(".", ",")}%`;
}

export type OwnerReportMail = { subject: string; text: string; html: string };

export function buildOwnerWeeklyReportMail(periods: WeeklyReportPeriods, cur: WeeklyStats, prev: WeeklyStats, siteUrl: string): OwnerReportMail {
  const lastDay = new Date(Date.parse(periods.current.to) - 1).toISOString();
  const range = `${warsawDay(periods.current.from)} – ${warsawDay(lastDay)}`;
  const failed = (s: WeeklyStats) => s.failed_master + s.failed_video + s.failed_export + s.failed_separate + s.failed_cleanup + s.failed_render;
  const zl = (s: WeeklyStats) => s.payments_grosz;
  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Ludzie i nagrania",
      rows: [
        row("Nowe konta", cur.new_accounts, prev.new_accounts),
        row("Aktywni nagrywający", cur.active_recorders, prev.active_recorders),
        row("Nowe nagrania", cur.new_takes, prev.new_takes),
        row("Maile „nic jeszcze nie nagrałeś”", cur.nudges_sent, prev.nudges_sent),
      ],
    },
    {
      title: "Pieniądze (PayU)",
      rows: [
        row("Opłacone zamówienia", cur.payments_count, prev.payments_count),
        { ...row("Suma wpłat", zl(cur), zl(prev), formatZloty), change: formatSignedZloty(zl(cur) - zl(prev)) },
        row("Zwroty", cur.refunds_count, prev.refunds_count),
        { ...row("Suma zwrotów", cur.refunds_grosz, prev.refunds_grosz, formatZloty), change: formatSignedZloty(cur.refunds_grosz - prev.refunds_grosz) },
      ],
    },
    {
      title: "Studio",
      rows: [
        row("Gotowe mastery", cur.masters_done, prev.masters_done),
        row("Gotowe wideo", cur.videos_done, prev.videos_done),
        row("Opublikowane utwory", cur.works_published, prev.works_published),
      ],
    },
    {
      title: "Błędy kolejek",
      rows: [
        row("Master", cur.failed_master, prev.failed_master),
        row("Wideo", cur.failed_video, prev.failed_video),
        row("Inne eksporty (WAV/ZIP/MP3)", cur.failed_export, prev.failed_export),
        row("Separacja", cur.failed_separate, prev.failed_separate),
        row("Czyszczenie wokalu", cur.failed_cleanup, prev.failed_cleanup),
        row("Render E3", cur.failed_render, prev.failed_render),
        row("Razem", failed(cur), failed(prev)),
      ],
    },
  ];
  // Same funnel definition as /admin/lejek: views → buy clicks → started orders → paid orders.
  const steps = funnelSteps({ views: cur.funnel.premium_view ?? 0, clicks: cur.funnel.buy_click ?? 0, started: cur.orders_started, paid: cur.payments_count });
  const prevSteps = funnelSteps({ views: prev.funnel.premium_view ?? 0, clicks: prev.funnel.buy_click ?? 0, started: prev.orders_started, paid: prev.payments_count });
  const stepLabel = { views: "Wejścia na /premium", clicks: "Kliknięcia „Kup”", started: "Rozpoczęte zamówienia", paid: "Opłacone" } as const;
  const funnelRows: Row[] = steps.map((s, i) => ({
    label: stepLabel[s.id],
    cur: i === 0 ? String(s.count) : `${s.count} (${pct(s.fromPrevious)})`,
    prev: i === 0 ? String(prevSteps[i].count) : `${prevSteps[i].count} (${pct(prevSteps[i].fromPrevious)})`,
    change: delta(s.count, prevSteps[i].count),
  }));
  sections.push({ title: "Lejek zakupu", rows: funnelRows });

  const subject = `BitRymDym: raport tygodnia ${range}`;
  const base = siteUrl.replace(/\/+$/, "");
  const head = `Raport tygodnia ${range} (czas polski). W nawiasie poprzedni tydzień.`;
  const text = [
    head,
    ...sections.flatMap((s) => ["", s.title.toUpperCase(), ...s.rows.map((r) => `${r.label}: ${r.cur} (poprzednio ${r.prev}, ${r.change})`)]),
    "",
    `Panel: ${base}/admin`,
  ].join("\n");
  const cell = "padding:4px 8px;border-bottom:1px solid #cbbfa9;text-align:left";
  const html = `<!doctype html><html lang="pl"><body style="margin:0;background:#f3ebdd;font-family:Arial,Helvetica,sans-serif;color:#16130f">
<div style="max-width:640px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:2px">BITRYMDYM</p>
<h1 style="margin:0 0 8px;font-size:22px">Raport tygodnia</h1>
<p style="margin:0 0 16px">${escapeHtml(`${range} (czas polski)`)}</p>
${sections
  .map(
    (s) => `<h2 style="margin:20px 0 8px;font-size:16px">${escapeHtml(s.title)}</h2>
<table style="border-collapse:collapse;width:100%;font-size:14px"><tr><th style="${cell}"></th><th style="${cell}">Ten tydzień</th><th style="${cell}">Poprzedni</th><th style="${cell}">Zmiana</th></tr>
${s.rows.map((r) => `<tr><td style="${cell}">${escapeHtml(r.label)}</td><td style="${cell}">${escapeHtml(r.cur)}</td><td style="${cell}">${escapeHtml(r.prev)}</td><td style="${cell}">${escapeHtml(r.change)}</td></tr>`).join("\n")}
</table>`,
  )
  .join("\n")}
<p style="margin:20px 0 0"><a href="${escapeHtml(`${base}/admin`)}" style="color:#16130f">Otwórz panel</a></p>
</div></body></html>`;
  return { subject, text, html };
}

function formatSignedZloty(grosz: number): string {
  if (grosz === 0) return "bez zmian";
  return `${grosz > 0 ? "+" : "−"}${formatZloty(Math.abs(grosz))}`;
}
