import { describe, expect, it } from "vitest";

import {
  buildOwnerWeeklyReportMail,
  formatZloty,
  isWarsawMonday,
  parseReportRecipients,
  parseWeeklyStats,
  warsawMidnight,
  weeklyReportPeriods,
} from "@/lib/reports/owner-weekly-report";

describe("Warsaw calendar", () => {
  it("Monday is checked in Warsaw time, not UTC", () => {
    expect(isWarsawMonday(Date.parse("2026-11-23T07:00:00Z"))).toBe(true);
    expect(isWarsawMonday(Date.parse("2026-11-22T07:00:00Z"))).toBe(false);
    // 23:30 UTC Sunday = 00:30 Monday in Warsaw.
    expect(isWarsawMonday(Date.parse("2026-11-22T23:30:00Z"))).toBe(true);
  });
  it("midnight in winter and summer time", () => {
    expect(new Date(warsawMidnight(Date.parse("2026-11-23T07:00:00Z"))).toISOString()).toBe("2026-11-22T23:00:00.000Z");
    expect(new Date(warsawMidnight(Date.parse("2026-07-06T07:00:00Z"))).toISOString()).toBe("2026-07-05T22:00:00.000Z");
  });
  it("periods are the last full Warsaw week and the one before", () => {
    expect(weeklyReportPeriods(Date.parse("2026-11-23T07:12:00Z"))).toEqual({
      key: "2026-11-23",
      current: { from: "2026-11-15T23:00:00.000Z", to: "2026-11-22T23:00:00.000Z" },
      previous: { from: "2026-11-08T23:00:00.000Z", to: "2026-11-15T23:00:00.000Z" },
    });
  });
  it("a week across the DST change still starts at Warsaw midnight", () => {
    // Sunday 2026-10-25: CEST → CET, so the week 19–25 October is 7 d + 1 h long.
    const p = weeklyReportPeriods(Date.parse("2026-11-02T07:00:00Z"));
    expect(p.current).toEqual({ from: "2026-10-25T23:00:00.000Z", to: "2026-11-01T23:00:00.000Z" });
    expect(p.previous).toEqual({ from: "2026-10-18T22:00:00.000Z", to: "2026-10-25T23:00:00.000Z" });
  });
});

describe("parseReportRecipients", () => {
  it("reads a comma list, drops garbage and duplicates, max 3", () => {
    expect(parseReportRecipients(undefined)).toEqual([]);
    expect(parseReportRecipients(" A@x.pl, a@x.pl ,bad, <x@y.pl>, b@y.pl, c@z.pl, d@w.pl")).toEqual(["a@x.pl", "b@y.pl", "c@z.pl"]);
  });
});

describe("owner weekly mail", () => {
  const periods = weeklyReportPeriods(Date.parse("2026-11-23T07:00:00Z"));
  const cur = parseWeeklyStats({
    new_accounts: 12, orders_started: 5, payments_count: 3, payments_grosz: 123456, refunds_count: 1, refunds_grosz: 2900,
    active_recorders: 7, new_takes: "40", masters_done: 4, videos_done: 2, works_published: 1,
    failed_master: 1, failed_video: 0, failed_export: 0, failed_separate: 2, failed_cleanup: 0, failed_render: 0,
    nudges_sent: 9, funnel: { premium_view: 100, buy_click: 10 },
  });
  const prev = parseWeeklyStats({ new_accounts: 10, payments_count: 3, payments_grosz: 123456, funnel: null, junk: -5 });

  it("normalises stats (missing/garbage → 0)", () => {
    expect(prev.new_takes).toBe(0);
    expect(prev.funnel).toEqual({});
    expect(cur.new_takes).toBe(40);
    expect(parseWeeklyStats(null).new_accounts).toBe(0);
  });
  it("formats złoty in Polish", () => {
    expect(formatZloty(123456)).toBe("1 234,56 zł");
    expect(formatZloty(0)).toBe("0,00 zł");
  });
  it("compares this week with the previous one, funnel included, without personal data", () => {
    const m = buildOwnerWeeklyReportMail(periods, cur, prev, "https://brd.pl/");
    expect(m.subject).toBe("BitRymDym: raport tygodnia 16 listopada – 22 listopada");
    expect(m.text).toContain("Nowe konta: 12 (poprzednio 10, +2)");
    expect(m.text).toContain("Suma wpłat: 1 234,56 zł (poprzednio 1 234,56 zł, bez zmian)");
    expect(m.text).toContain("Suma zwrotów: 29,00 zł (poprzednio 0,00 zł, +29,00 zł)");
    expect(m.text).toContain("Separacja: 2 (poprzednio 0, +2)");
    expect(m.text).toContain("Razem: 3 (poprzednio 0, +3)");
    expect(m.text).toContain("Kliknięcia „Kup”: 10 (10%)");
    expect(m.text).toContain("Maile „nic jeszcze nie nagrałeś”: 9");
    expect(m.text).toContain("Panel: https://brd.pl/admin");
    expect(m.text).not.toMatch(/@/);
    expect(m.html).toContain('lang="pl"');
  });
});
