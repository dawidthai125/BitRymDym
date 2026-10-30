/**
 * Legal documents: versions + operator placeholders (pure).
 * Placeholders stay in [NAWIASACH] until Dawid provides the data — see LEGAL_PLACEHOLDERS.
 * Bump a version whenever the text changes materially (stored with each consent).
 */
export const TERMS_VERSION = "2026-10-30-wzor";
export const PRIVACY_VERSION = "2026-10-30-wzor";

export const LEGAL_PATHS = { terms: "/regulamin", privacy: "/polityka-prywatnosci", cookies: "/cookies" } as const;

/** Operator data to fill in (one place). */
export const OPERATOR = {
  name: "[NAZWA OPERATORA / FIRMA]",
  form: "[FORMA DZIAŁALNOŚCI, np. jednoosobowa działalność gospodarcza wpisana do CEIDG]",
  address: "[ADRES SIEDZIBY / DO DORĘCZEŃ]",
  nip: "[NIP]",
  regon: "[REGON]",
  email: "[E-MAIL KONTAKTOWY]",
  privacyEmail: "[E-MAIL DS. DANYCH OSOBOWYCH — może być ten sam]",
  phone: "[TELEFON — opcjonalnie]",
  domain: "[DOMENA SERWISU, np. bitrymdym.pl]",
} as const;

/** Every placeholder Dawid must resolve (data or decision). */
export const LEGAL_PLACEHOLDERS: readonly string[] = [
  ...Object.values(OPERATOR),
  "[DATA WEJŚCIA W ŻYCIE]",
  "[LOKALIZACJA SERWERA E3]",
  "[ZASADY LICENCJI NA BITY Z KATALOGU]",
  "[OPERATOR PŁATNOŚCI]",
  "[MINIMALNY WIEK]",
  "[OKRES PRZECHOWYWANIA LOGÓW]",
];

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
