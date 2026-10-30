import { describe, expect, it } from "vitest";

import { COOKIES } from "@/content/legal/cookies";
import { PRIVACY } from "@/content/legal/privacy";
import { TERMS } from "@/content/legal/terms";
import type { LegalDoc } from "@/content/legal/types";

import { LEGAL_PLACEHOLDERS, PLACEHOLDER_RE, purchaseConsentValid, signupConsent, TERMS_VERSION } from "./legal-config";

const text = (d: LegalDoc) => JSON.stringify(d);

describe("legal documents", () => {
  it("every placeholder used in the texts is on Dawid's to-do list", () => {
    const used = new Set([TERMS, PRIVACY, COOKIES].flatMap((d) => text(d).match(PLACEHOLDER_RE) ?? []));
    const known = new Set([...LEGAL_PLACEHOLDERS, "[DO WERYFIKACJI]", "[DO UZUPEŁNIENIA]"]);
    expect([...used].filter((p) => !known.has(p))).toEqual([]);
  });
  it("final documents: no placeholders left, operator data + 16+ age filled", () => {
    for (const d of [TERMS, PRIVACY, COOKIES]) expect(text(d).match(PLACEHOLDER_RE) ?? []).toEqual([]);
    expect(LEGAL_PLACEHOLDERS).toEqual([]);
    expect(TERMS_VERSION).toBe("2026-11-01");
    const all = text(TERMS) + text(PRIVACY);
    for (const s of ["8952035524", "dawid.thai@int.pl", "1 listopada 2026", "PayPro S.A.", "Krajowy Integrator Płatności S.A.", "12 miesięcy"]) expect(all).toContain(s);
    expect(text(TERMS)).toContain("ukończyła 16 lat");
    expect(text(PRIVACY)).toContain("ukończyły 16 lat");
    expect(text(TERMS)).not.toContain("tel.");
  });
  it("covers the real processors and retention", () => {
    const p = text(PRIVACY);
    for (const s of ["Supabase", "Vercel", "E3", "Gemini", "Groq", "Cloudflare", "Pollinations", "Resend", "Free 2 dni", "Gold 45 dni", "Prezesa Urzędu Ochrony Danych"]) expect(p).toContain(s);
    expect(text(TERMS)).toContain("art. 38 ust. 1 pkt 13");
  });
  it("cookie policy lists only necessary cookies (no banner)", () => {
    const c = text(COOKIES);
    expect(c).toContain("nie wyświetlamy banera");
    expect(c).not.toMatch(/_ga|analytics|pixel/i);
  });
});

describe("consents", () => {
  it("signup consent carries versions + timestamp", () => {
    const c = signupConsent(new Date("2026-10-30T10:00:00Z"));
    expect(c).toEqual({ terms_version: TERMS_VERSION, privacy_version: expect.any(String), terms_accepted_at: "2026-10-30T10:00:00.000Z" });
  });
  it("purchase needs both boxes", () => {
    expect(purchaseConsentValid({ acceptTerms: true, immediatePerformance: true })).toBe(true);
    expect(purchaseConsentValid({ acceptTerms: true, immediatePerformance: false })).toBe(false);
    expect(purchaseConsentValid({ acceptTerms: false, immediatePerformance: true })).toBe(false);
  });
});
