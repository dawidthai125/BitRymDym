import { describe, expect, it } from "vitest";

import { KIND_CATEGORY, notifyEnv } from "./config";
import { buildMail, escapeHtml } from "./templates";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe-token";

const SECRET = "s".repeat(40);
const UID = "0b7f3c1e-6c1a-4e57-9a62-1d2c3b4a5f60";
const LINKS = { unsubscribe: "https://brd.pl/api/email/unsubscribe?t=x", preferences: "https://brd.pl/account#powiadomienia" };

describe("notifyEnv (off until every key exists)", () => {
  const full = { EMAIL_NOTIFICATIONS_ENABLED: "true", RESEND_API_KEY: "re_x", RESEND_FROM_EMAIL: "BitRymDym <no-reply@brd.pl>", EMAIL_UNSUBSCRIBE_SECRET: SECRET };
  it("is enabled only with flag + Resend + secret", () => {
    expect(notifyEnv(full).enabled).toBe(true);
    expect(notifyEnv({}).enabled).toBe(false);
    expect(notifyEnv({ ...full, EMAIL_NOTIFICATIONS_ENABLED: "false" }).enabled).toBe(false);
    expect(notifyEnv({ ...full, RESEND_API_KEY: "" }).enabled).toBe(false);
    expect(notifyEnv({ ...full, EMAIL_UNSUBSCRIBE_SECRET: "short" }).enabled).toBe(false);
  });
});

describe("unsubscribe token", () => {
  it("round-trips and rejects tampering", () => {
    const t = signUnsubscribeToken(SECRET, UID, "studio");
    expect(verifyUnsubscribeToken(SECRET, t)).toEqual({ userId: UID, scope: "studio" });
    expect(verifyUnsubscribeToken("x".repeat(40), t)).toBeNull();
    const forged = `${Buffer.from(`${UID}.all`).toString("base64url")}.${t.split(".")[1]}`;
    expect(verifyUnsubscribeToken(SECRET, forged)).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "")).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, "a.b.c")).toBeNull();
  });
  it("rejects a non-uuid user or unknown scope even when signed", () => {
    expect(verifyUnsubscribeToken(SECRET, signUnsubscribeToken(SECRET, "nope", "all"))).toBeNull();
    expect(verifyUnsubscribeToken(SECRET, signUnsubscribeToken(SECRET, UID, "promo" as never))).toBeNull();
  });
});

describe("templates (Polish)", () => {
  it("has a template + category for every kind", () => {
    for (const k of Object.keys(KIND_CATEGORY) as (keyof typeof KIND_CATEGORY)[]) {
      const m = buildMail(k, { siteUrl: "https://brd.pl", beatTitle: "Bit", projectTitle: "Proj", projectId: "p1", beatId: "b1" }, LINKS);
      expect(m.subject.length).toBeGreaterThan(5);
      expect(m.text).toContain(LINKS.unsubscribe);
      expect(m.html).toContain("Wypisz się");
      expect(m.html).toContain('lang="pl"');
    }
  });
  it("escapes user content and strips header injection from the subject", () => {
    const m = buildMail("beat_rejected", { siteUrl: "https://brd.pl", beatTitle: "<b>x</b>\r\nBcc: a@b.c", reason: "<script>" }, LINKS);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;b&gt;");
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.text).toContain("Powód: <script>");
  });
  it("links to the right places", () => {
    expect(buildMail("master_ready", { siteUrl: "https://brd.pl/", projectId: "abc" }, LINKS).text).toContain("https://brd.pl/studio/p/abc");
    expect(buildMail("beat_approved", { siteUrl: "https://brd.pl", beatId: "b1" }, LINKS).text).toContain("https://brd.pl/beat/b1");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
});
