import { describe, expect, it } from "vitest";

import { formatTakeExpiryWhen, planTakeExpiryMails } from "@/lib/email/notify/take-expiry-plan";
import { buildMail } from "@/lib/email/notify/templates";

const A = "owner-a";
const B = "owner-b";

describe("planTakeExpiryMails", () => {
  it("one mail per owner, earliest project, only takes in the owner's own projects", () => {
    const plan = planTakeExpiryMails(
      [
        { takeId: "t1", ownerId: A, expiresAt: "2026-11-23T10:00:00Z" },
        { takeId: "t2", ownerId: A, expiresAt: "2026-11-23T05:00:00Z" },
        { takeId: "t3", ownerId: B, expiresAt: "2026-11-23T05:00:00Z" },
        { takeId: "t4", ownerId: B, expiresAt: "2026-11-23T05:00:00Z" },
      ],
      [
        { takeId: "t1", projectId: "p1", projectTitle: "Jeden", projectOwnerId: A },
        { takeId: "t2", projectId: "p2", projectTitle: "Dwa", projectOwnerId: A },
        { takeId: "t3", projectId: "px", projectTitle: "Cudzy", projectOwnerId: A },
      ],
    );
    expect(plan).toEqual([
      { ownerId: A, projectId: "p2", projectTitle: "Dwa", expiresAt: "2026-11-23T05:00:00.000Z", takeIds: ["t1", "t2"], otherProjects: 1 },
    ]);
  });
  it("nothing without clips", () => {
    expect(planTakeExpiryMails([{ takeId: "t1", ownerId: A, expiresAt: "2026-11-23T10:00:00Z" }], [])).toEqual([]);
  });
});

describe("formatTakeExpiryWhen", () => {
  it("says jutro in Polish time", () => {
    const now = Date.parse("2026-11-22T07:00:00Z");
    expect(formatTakeExpiryWhen("2026-11-23T07:54:47Z", now)).toBe("jutro (23 listopada) o 08:54");
    expect(formatTakeExpiryWhen("2026-11-22T20:00:00Z", now)).toBe("dziś (22 listopada) o 21:00");
  });
});

describe("take_expiring mail", () => {
  it("names the project, the deadline and links to it", () => {
    const m = buildMail("take_expiring", { siteUrl: "https://www.bitrymdym.pl", projectTitle: "Studio", projectId: "p1", detail: "jutro (23 listopada) o 08:54" }, { unsubscribe: "https://u", preferences: "https://p" });
    expect(m.subject).toBe("Nagranie wygasa: Studio");
    expect(m.text).toContain("wygaśnie jutro (23 listopada) o 08:54");
    expect(m.text).toContain("https://www.bitrymdym.pl/studio/p/p1");
  });
});
