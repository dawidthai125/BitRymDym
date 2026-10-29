import { getLocale } from "next-intl/server";

import { resolveLocale } from "@/i18n/config";
import { makeLibText, type LibText } from "@/i18n/lib-text";

/** Server helper: translate lib/server-produced Polish text for the request locale. */
export async function getLibText(): Promise<LibText> {
  return makeLibText(resolveLocale(await getLocale()));
}
