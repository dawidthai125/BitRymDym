import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseVisitHeader, visitHeaderValue, visitPath, VISIT_SOURCES, visitSource, visitStatsFromRows } from "@/lib/visits/visit-policy";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1";
const h = (over: Record<string, string> = {}) =>
  new Headers({ "user-agent": UA, "sec-fetch-dest": "document", "sec-fetch-site": "cross-site", ...over });
const value = (headers: Headers, over: Partial<Parameters<typeof visitHeaderValue>[0]> = {}) =>
  visitHeaderValue({ method: "GET", headers, pathname: "/beats", utmSource: null, cookieHeader: null, ...over });

describe("entry counter", () => {
  it("names the source from the referring site, the app or utm_source", () => {
    const from = (referer: string) => visitSource(h({ referer }), null);
    expect(from("https://l.facebook.com/")).toBe("facebook");
    expect(from("https://l.instagram.com/x")).toBe("instagram");
    expect(from("https://www.tiktok.com/")).toBe("tiktok");
    expect(from("https://www.youtube.com/")).toBe("youtube");
    expect(from("https://www.google.pl/")).toBe("google");
    expect(from("https://mail.google.com/")).toBe("mail");
    expect(from("https://gemini.google.com/")).toBe("ai");
    expect(from("https://google.evil.example/")).toBe("other");
    expect(from("https://example.org/")).toBe("other");
    expect(visitSource(h(), null)).toBe("direct");
    expect(visitSource(h({ "user-agent": `${UA} Instagram 300.0` }), null)).toBe("instagram");
    expect(visitSource(h({ "user-agent": `${UA} musical_ly_2023 BytedanceWebview` }), null)).toBe("tiktok");
    expect(visitSource(h(), "TikTok")).toBe("tiktok");
    expect(visitSource(h(), "<script>")).toBe("direct");
  });

  it("does not count coming back from payment or between our own addresses", () => {
    expect(visitSource(h({ referer: "https://secure.payu.com/" }), null)).toBeNull();
    expect(visitSource(h({ referer: "https://bitrymdym.com/" }), "tiktok")).toBeNull();
  });

  it("counts only a page opened by a person from outside", () => {
    expect(value(h({ referer: "https://l.facebook.com/" }))).toBe("facebook %2Fbeats");
    expect(value(h({ "sec-fetch-site": "none" }))).toBe("direct %2Fbeats");
    expect(value(h({ "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(value(h({ "sec-fetch-dest": "empty" }))).toBeNull();
    expect(value(h({ "sec-purpose": "prefetch" }))).toBeNull();
    expect(value(h({ "user-agent": "Googlebot/2.1" }))).toBeNull();
    expect(value(h(), { method: "POST" })).toBeNull();
    for (const pathname of ["/admin", "/admin/lejek", "/api/funnel", "/auth/callback"]) expect(value(h(), { pathname })).toBeNull();
    expect(value(h(), { cookieHeader: "a=1; brd_staff=1" })).toBeNull();
  });

  it("round-trips the header and refuses anything unexpected", () => {
    expect(parseVisitHeader("google %2Fporadniki%2Foddech-w-rapie")).toEqual({ source: "google", pathname: "/poradniki/oddech-w-rapie" });
    for (const bad of [null, "", "google", "nope %2F", "google %2F extra", "google %E0%A4%A"]) expect(parseVisitHeader(bad)).toBeNull();
  });

  it("keeps the page key bounded and accepted by the database", () => {
    const known = (_s: string, slug: string) => slug === "oddech-w-rapie" || slug === "metronom-online";
    expect(visitPath("/", known)).toBe("/");
    expect(visitPath("/en", known)).toBe("/");
    expect(visitPath("/en/beats/", known)).toBe("/beats");
    expect(visitPath("/beat/00373ed1-6de9-4b6a-9bc1-6aa8d87cbeb0", known)).toBe("/beat");
    expect(visitPath("/poradniki/oddech-w-rapie", known)).toBe("/poradniki/oddech-w-rapie");
    expect(visitPath("/poradniki/wp-login", known)).toBe("inne");
    expect(visitPath("/wp-admin.php", known)).toBe("inne");
    expect(visitPath("/rymy/kot", known)).toBe("/rymy");
    const sql = readFileSync("supabase/migrations/20261124150000_site_visits.sql", "utf8");
    expect(sql).toContain("revoke all on table public.site_visits from anon, authenticated");
    expect(sql).toContain("revoke all on function public.record_site_visit(text, text) from public, anon, authenticated");
    for (const s of VISIT_SOURCES) expect(s).toMatch(/^[a-z]{1,12}$/);
    // Only counters: no column that could identify a person.
    expect(sql).not.toMatch(/\b(user_id|ip|user_agent|session|uuid)\b\s+(uuid|text|inet)/);
  });

  it("sorts the admin numbers", () => {
    const s = visitStatsFromRows([
      { kind: "day", key: "2026-11-23", views: 2 },
      { kind: "day", key: "2026-11-24", views: 3 },
      { kind: "source", key: "direct", views: 1 },
      { kind: "source", key: "facebook", views: 4 },
    ]);
    expect(s.total).toBe(5);
    expect(s.days[0]!.key).toBe("2026-11-24");
    expect(s.sources[0]).toEqual({ key: "facebook", views: 4 });
    expect(s.paths).toEqual([]);
  });
});
