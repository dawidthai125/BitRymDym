import { useLocale } from "next-intl";

import { resolveLocale } from "@/i18n/config";
import { makeLibText, type LibText } from "@/i18n/lib-text";

/**
 * Translate lib/server-produced Polish text for the active locale.
 * Works in client components and in non-async server components
 * (next-intl's `useLocale` supports both); async server components use
 * `getLibText()` instead.
 */
export function useLibText(): LibText {
  return makeLibText(resolveLocale(useLocale()));
}
