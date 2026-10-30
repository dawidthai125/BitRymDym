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
