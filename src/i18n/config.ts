export const LOCALES = ["pl", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "pl";
/** Cookie set by the language switcher. No URL prefix, no Accept-Language detection. */
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function resolveLocale(value: string | undefined | null): AppLocale {
  return (LOCALES as readonly string[]).includes(value ?? "") ? (value as AppLocale) : DEFAULT_LOCALE;
}

/** Intl tag used for dates/numbers. */
export function intlTag(locale: AppLocale): string {
  return locale === "en" ? "en-GB" : "pl-PL";
}

/** Word the user types to confirm account deletion, per UI language. */
export const DELETE_CONFIRM_WORD: Record<AppLocale, string> = {
  pl: "USUŃ",
  en: "DELETE",
};

/** Server accepts the confirm word of any supported language (UI language may change mid-form). */
export function isDeleteConfirmWord(value: string): boolean {
  return LOCALES.some((l) => DELETE_CONFIRM_WORD[l] === value);
}
