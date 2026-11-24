import { describe, expect, it } from "vitest";

import { COOKIES } from "@/content/legal/cookies";
import { PRIVACY } from "@/content/legal/privacy";
import { TERMS } from "@/content/legal/terms";
import type { LegalDoc } from "@/content/legal/types";

import { TERMS_ARCHIVE } from "@/content/legal/archive";

import { LEGAL_PLACEHOLDERS, PLACEHOLDER_RE, purchaseConsentValid, signupConsent, TERMS_NOTICE_UNTIL, TERMS_VERSION, termsNoticeDue } from "./legal-config";

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
    expect(TERMS_VERSION).toBe("2026-11-24.2");
    const all = text(TERMS) + text(PRIVACY);
    for (const s of ["8952035524", "dawid.thai@int.pl", "24 listopada 2026", "9 grudnia 2026", "PayU S.A.", "Poznaniu", "12 miesięcy", "AcoustID", "Bit Rym Dym", "Plik ze znakiem wodnym", "24 godziny", "84 godziny"]) expect(all).toContain(s);
    expect(all).not.toContain("PayPro");
    expect(all).not.toMatch(/uruchomieniu płatności|charakter informacyjny/);
    expect(text(PRIVACY)).not.toContain("język, motyw");
    expect(text(COOKIES)).toContain("brd-take-recovery");
    expect(text(COOKIES)).toContain("sessionStorage");
    expect(text(TERMS) + text(PRIVACY) + text(COOKIES)).not.toContain("team@bitrymdym.pl");
    expect(all).not.toMatch(/Tpay|Krajowy Integrator/i);
    expect(text(TERMS)).toContain("dzień za dzień");
    expect(text(TERMS)).toContain("włącza się sam");
    expect(text(PRIVACY)).toContain("zaplanowanego następnego Planu");
    expect(text(TERMS)).toContain("ukończyła 16 lat");
    expect(text(PRIVACY)).toContain("ukończyły 16 lat");
    expect(text(TERMS)).not.toContain("tel.");
  });
  it("published work: public 45 s clip with the catalogue beat, comment reports (2026-11-22.2)", () => {
    const t = text(TERMS);
    for (const s of ["Katalog utworów: publikując w katalogu utwór", "fragment tego utworu do 45 sekund, razem z użytym Bitem z katalogu", "także osobom bez Konta", "Pełny utwór pozostaje u autora", "po wycofaniu utworu z katalogu", "nie jest udostępnianiem samego Bitu", "przyciskiem „Zgłoś”", "właściciel utworu może ukryć komentarz"]) expect(t).toContain(s);
    expect(t).not.toContain("Czystego mastera nie odtwarzamy w przeglądarce");
  });
  it("catalogue licence allows credited monetisation, keeps Content ID / sync / beat resale behind consent", () => {
    const t = text(TERMS);
    for (const s of ["monetyzować", "Spotify", "YouTube", "prod. [ksywka autora] / BitRymDym", "Content ID", "synchronizacja", "przypisywanie sobie autorstwa Bitu"]) expect(t).toContain(s);
    expect(t).not.toContain("w celach niekomercyjnych");
  });
  it("covers the real processors and retention", () => {
    const p = text(PRIVACY);
    for (const s of ["Supabase", "Vercel", "E3", "Gemini", "Groq", "xAI (Grok)", "Cloudflare", "Resend", "Free 2 dni", "Gold 45 dni", "Prezesa Urzędu Ochrony Danych"]) expect(p).toContain(s);
    expect(text(TERMS)).toContain("art. 38 ust. 1 pkt 13");
    // Pollinations failover removed (2026-10-31) — must not be listed as a processor.
    expect(text(PRIVACY) + text(TERMS)).not.toMatch(/pollinations/i);
  });
  it("cookie policy: necessary cookies without consent, Google Analytics only after consent, no ads", () => {
    const c = text(COOKIES);
    expect(c).toContain("tylko za Twoją zgodą");
    expect(c).toContain("_ga");
    expect(c).toContain("brd_consent");
    expect(c).toContain("Nie używamy cookies reklamowych");
    expect(c).not.toMatch(/pixel|facebook|meta ads/i);
  });
});

describe("change of the terms (§ 12)", () => {
  it("14 full days between the announcement and the day it binds existing accounts", () => {
    expect((Date.parse(TERMS_NOTICE_UNTIL) - Date.parse("2026-11-24T12:00:00+01:00")) / 86_400_000).toBeGreaterThan(14);
  });
  it("notice: accounts from before the change, until the day it applies", () => {
    const day = Date.parse("2026-11-30T12:00:00Z");
    expect(termsNoticeDue("2026-11-01T10:00:00Z", day)).toBe(true);
    expect(termsNoticeDue("2026-11-26T10:00:00Z", day)).toBe(false);
    expect(termsNoticeDue("2026-11-01T10:00:00Z", Date.parse("2026-12-09T01:00:00+01:00"))).toBe(false);
    expect(termsNoticeDue(null, day)).toBe(false);
  });
  it("earlier versions stay readable, newest first, never the current one", () => {
    const versions = TERMS_ARCHIVE.map((doc) => doc.version);
    expect(versions).toEqual(["2026-11-22.4", "2026-11-15.4", "2026-11-15.3", "2026-11-12.1", "2026-11-07.2", "2026-11-01"]);
    expect(versions).not.toContain(TERMS_VERSION);
    for (const doc of TERMS_ARCHIVE) expect(doc.sections).toHaveLength(12);
  });
  it("what the service really does is in the documents", () => {
    for (const s of ["niesłyszalnym znakiem", "Publiczny profil twórcy", "nie przywraca wykorzystanych limitów", "art. 11 i 12 DSA"]) expect(text(TERMS)).toContain(s);
    for (const s of ["Turnstile", "YouTube", "niesłyszalnym znakiem", "kto kogo polecił", "asystent BITEK, teksty i podpowiedzi muzyczne AI"]) expect(text(PRIVACY)).toContain(s);
    for (const s of ["brd_app", "brd_signup_browser", "youtube-nocookie.com"]) expect(text(COOKIES)).toContain(s);
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
