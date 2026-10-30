/**
 * Legal documents: versions + operator data (pure).
 * Any text still in [NAWIASACH] is an unresolved placeholder and must be listed in
 * LEGAL_PLACEHOLDERS (legal.test.ts enforces that none remain).
 * Bump a version whenever the text changes materially (stored with each consent).
 */
export const TERMS_VERSION = "2026-11-01";
export const PRIVACY_VERSION = "2026-11-01";

/** Effective date shown in the documents (matches the versions above). */
export const LEGAL_EFFECTIVE_DATE = "1 listopada 2026 r.";

export const LEGAL_PATHS = { terms: "/regulamin", privacy: "/polityka-prywatnosci", cookies: "/cookies" } as const;

/** Operator data (one place). `phone` empty = not shown. */
export const OPERATOR = {
  name: "D&P Dawid Thai Thanh",
  form: "osoba fizyczna prowadząca jednoosobową działalność gospodarczą wpisaną do CEIDG",
  address: "ul. Poświęcka 17C/26, 51-128 Wrocław",
  nip: "8952035524",
  regon: "022517157",
  email: "dawid.thai@int.pl",
  privacyEmail: "dawid.thai@int.pl",
  phone: "",
  domain: "bitrymdym.pl",
} as const;

/** Minimum age to create an Account (RODO art. 8 / art. 8 ust. 1 ustawy o ochronie danych osobowych). */
export const MINIMUM_AGE = 16;

/** Unresolved placeholders (data or decision). Empty = documents complete. */
export const LEGAL_PLACEHOLDERS: readonly string[] = [];

export const PLACEHOLDER_RE = /\[[A-ZĄĆĘŁŃÓŚŹŻ0-9][^\]]*\]/g;

/** Signup / purchase consent payload stored with the account or the order. */
export type LegalConsent = { terms_version: string; privacy_version: string; terms_accepted_at: string };

export function signupConsent(now = new Date()): LegalConsent {
  return { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, terms_accepted_at: now.toISOString() };
}

/** Future checkout (digital content / service, art. 38 ust. 1 pkt 13 u.p.k.): both boxes must be ticked. */
export type PurchaseConsentInput = { acceptTerms: boolean; immediatePerformance: boolean };
export function purchaseConsentValid(c: PurchaseConsentInput): boolean {
  return c.acceptTerms === true && c.immediatePerformance === true;
}
