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
