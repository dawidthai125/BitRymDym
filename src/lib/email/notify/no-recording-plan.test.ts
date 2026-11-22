import { describe, expect, it } from "vitest";

import { KIND_CATEGORY } from "@/lib/email/notify/config";
import { NO_RECORDING_MAILS_PER_RUN, noRecordingWindow, planNoRecordingMails, type NoRecordingCandidate } from "@/lib/email/notify/no-recording-plan";
import { buildMail } from "@/lib/email/notify/templates";

const NOW = Date.parse("2026-11-22T07:00:00Z");
const H = 3600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const acc = (over: Partial<NoRecordingCandidate> = {}): NoRecordingCandidate => ({
  userId: "u1", createdAt: ago(4 * D), emailConfirmed: true, role: "USER", hasTake: false, hasProject: false, studioMailOn: true, nudgeSentAt: null, ...over,
});
const LINKS = { unsubscribe: "https://brd.pl/api/email/unsubscribe?t=x", preferences: "https://brd.pl/account#powiadomienia" };

describe("planNoRecordingMails", () => {
  it("mails a 3–10-day-old account with nothing recorded", () => {
    expect(planNoRecordingMails([acc()], NOW)).toEqual(["u1"]);
  });
  it("age window: [3 d, 10 d)", () => {
    const n = (age: number) => planNoRecordingMails([acc({ createdAt: ago(age) })], NOW).length;
    expect(n(3 * D - 1)).toBe(0);
    expect(n(3 * D)).toBe(1);
    expect(n(10 * D - 1)).toBe(1);
    expect(n(10 * D)).toBe(0);
    expect(n(400 * D)).toBe(0);
  });
  it("matches the SQL sign-up window", () => {
    expect(noRecordingWindow(NOW)).toEqual({ createdAfter: ago(10 * D), createdBefore: ago(3 * D) });
  });
  it("skips accounts with a recording or a Studio project", () => {
    expect(planNoRecordingMails([acc({ hasTake: true }), acc({ userId: "u2", hasProject: true })], NOW)).toEqual([]);
  });
  it("skips unconfirmed e-mail, staff, Studio mails off and already nudged", () => {
    expect(
      planNoRecordingMails(
        [
          acc({ emailConfirmed: false }),
          acc({ userId: "a", role: "ADMIN" }),
          acc({ userId: "m", role: "moderator" }),
          acc({ userId: "o", studioMailOn: false }),
          acc({ userId: "s", nudgeSentAt: ago(1 * D) }),
        ],
        NOW,
      ),
    ).toEqual([]);
  });
  it("skips a bad date and duplicate rows", () => {
    expect(planNoRecordingMails([acc({ createdAt: "nope" }), acc(), acc()], NOW)).toEqual(["u1"]);
  });
  it("caps per run, oldest account first", () => {
    const many = Array.from({ length: NO_RECORDING_MAILS_PER_RUN + 10 }, (_, i) => acc({ userId: `u${String(i).padStart(3, "0")}`, createdAt: ago(4 * D + i * 60_000) }));
    const plan = planNoRecordingMails(many, NOW);
    expect(plan).toHaveLength(NO_RECORDING_MAILS_PER_RUN);
    expect(plan[0]).toBe(`u${String(NO_RECORDING_MAILS_PER_RUN + 9).padStart(3, "0")}`);
    expect(planNoRecordingMails(many, NOW, 2)).toHaveLength(2);
  });
});

describe("no_recording_yet mail", () => {
  it("is a Studio mail (same switch and unsubscribe as take_expiring)", () => {
    expect(KIND_CATEGORY.no_recording_yet).toBe("studio");
    expect(KIND_CATEGORY.no_recording_yet).toBe(KIND_CATEGORY.take_expiring);
  });
  it("links to Studio (Pierwsze kroki), the beat catalog and the how-to page, with an unsubscribe footer", () => {
    const m = buildMail("no_recording_yet", { siteUrl: "https://brd.pl/", name: "Kuba" }, LINKS);
    expect(m.subject).toBe("Bit czeka, mikrofon też");
    expect(m.text).toContain("Cześć Kuba,");
    expect(m.text).toContain("„Pierwsze kroki”");
    expect(m.text).toContain("Otwórz Studio: https://brd.pl/studio");
    expect(m.text).toContain("Katalog bitów: https://brd.pl/beats");
    expect(m.text).toContain("Jak nagrać utwór: https://brd.pl/jak-nagrac");
    expect(m.html).toContain('href="https://brd.pl/beats"');
    expect(m.html).toContain('href="https://brd.pl/jak-nagrac"');
    expect(m.text).toContain(LINKS.unsubscribe);
    expect(m.html).toContain("Wypisz się");
  });
});
