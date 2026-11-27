/**
 * Legal documents: versions + operator data (pure).
 * Any text still in [NAWIASACH] is an unresolved placeholder and must be listed in
 * LEGAL_PLACEHOLDERS (legal.test.ts enforces that none remain).
 * Bump a version whenever the text changes materially (stored with each consent).
 */
export const TERMS_VERSION = "2026-11-26.1"; // 2026-11-26.1: § 6 ust. 4–8 sprawdzanie każdego wgranego pliku (skrót i odcisk dźwięku), lista blokad zdjętych plików, oświadczenie o prawach przed wgraniem pliku z zewnątrz, sprawdzanie utworu przed katalogiem, przycisk „Zgłoś naruszenie praw”, odwołanie do człowieka; § 12 ust. 4 okres przejściowy do 11 grudnia; 2026-11-24.2: okres przejściowy obejmuje też zmianę z 7.11; 2026-11-24.1: § 3 lista usług, § 5 profil publiczny, § 7 kopia Bitu ze znakiem Konta, § 9 limity po usunięciu, § 12 zasady zmian i okres przejściowy; 2026-11-22.4: 2026-11-22.4: § 9 ust. 8 program poleceń „Zaproś znajomego” (pakiet 10 nagrań dla obu kont, limit 10/mies., zakaz kont-słupów); 2026-11-22.3: § 9 ust. 5 bit z katalogu płatnego na wyłączność (jeden kupujący, znika z katalogu);  2026-11-22.2: § 7 ust. 8 publiczny fragment 45 s utworu z katalogu (Free ze znakiem), § 6 zgłaszanie komentarzy (DSA art. 16); .1: § 9 oferta startowa
export const PRIVACY_VERSION = "2026-11-27.1"; // 2026-11-27.1: logowanie przez Google i Apple (dane od dostawcy, odbiorcy); 2026-11-26.3: 2026-11-26.3: opinie i zgłoszenia błędów (dane, podstawa, 24 miesiące); 2026-11-26.2: Stability AI w odbiorcach (pkt 5), pełna wersja EN dokumentów; 2026-11-26.1: odcisk i skrót każdego wgranego pliku, lista blokad, oświadczenia o prawach, zgłoszenia naruszeń, limit prób linków do odsłuchu, kopia zapasowa plików katalogu, czasy przechowywania; cookies: brakujące wpisy pamięci przeglądarki; 2026-11-24.4: licznik wejść bez cookies, zdarzenia Google Analytics (Konto, odtworzenie, zakup); 2026-11-24.3: znak Konta w kopii Bitu i dziennik odsłuchów, Turnstile, YouTube, xAI w BITEK-u, oceny/komentarze, polecenia, czasy przechowywania; 2026-11-24.2: doprecyzowanie pkt 5; 2026-11-24.1: pkt 5 publiczny profil twórcy (zgoda); 2026-11-23.1: Google Analytics 4 tylko po zgodzie (baner cookies), cookie brd_consent

/**
 * Terms: whoever accepts this version at sign-up is bound at once, everybody else after the 14 days of § 12
 * (announced 2026-11-24). The notice in the service (TermsNotice) is shown until that day.
 */
export const TERMS_DATE = "26 listopada 2026 r.";
export const TERMS_EFFECTIVE_EXISTING = "11 grudnia 2026 r.";
/** Day the versions of 7–24 November bind existing accounts (announced 2026-11-24, unchanged). */
export const TERMS_EFFECTIVE_EXISTING_PREVIOUS = "9 grudnia 2026 r.";
/** Accounts created before this moment did not accept TERMS_VERSION at sign-up. */
export const TERMS_NOTICE_BEFORE = "2026-11-27T00:00:00+01:00";
export const TERMS_NOTICE_UNTIL = "2026-12-11T00:00:00+01:00";

export function termsNoticeDue(accountCreatedAt: string | null | undefined, now = Date.now()): boolean {
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : Number.NaN;
  return Number.isFinite(created) && created < Date.parse(TERMS_NOTICE_BEFORE) && now < Date.parse(TERMS_NOTICE_UNTIL);
}

/** The privacy policy has its own date: it changes more often than the terms. */
export const PRIVACY_EFFECTIVE_DATE = "27 listopada 2026 r.";

/** English copies of the dates above (for the English translation of the documents; keep in sync). */
export const LEGAL_DATES_EN = {
  terms: "26 November 2026",
  termsExistingAccounts: "11 December 2026",
  termsExistingAccountsPrevious: "9 December 2026",
  privacy: "27 November 2026",
} as const;
/** Shown above the English translations. */
export const LEGAL_TRANSLATION_NOTE_EN = "This is an English translation for your convenience. The Polish version is the binding one; if the two differ, the Polish version prevails.";
/** OPERATOR.form in English. */
export const OPERATOR_FORM_EN = "a natural person running a sole proprietorship registered in CEIDG (the Polish Central Register of Business Activity)";

export const LEGAL_PATHS = { terms: "/regulamin", privacy: "/polityka-prywatnosci", cookies: "/cookies", archive: "/regulamin/archiwum" } as const;

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

/** A cheaper plan that starts later does not ask for immediate performance. */
export function purchaseConsentCovers(c: PurchaseConsentInput, startsLater: boolean): boolean {
  return c.acceptTerms === true && (startsLater || c.immediatePerformance === true);
}
