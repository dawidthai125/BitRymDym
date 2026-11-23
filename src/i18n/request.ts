import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { LOCALE_COOKIE, resolveLocale } from "./config";
import { LOCALE_OVERRIDE_HEADER } from "@/lib/seo/locale-paths";

export default getRequestConfig(async () => {
  const store = await cookies();
  // /en/... (middleware rewrite) forces English; otherwise the switcher cookie decides.
  const forced = (await headers()).get(LOCALE_OVERRIDE_HEADER);
  const locale = resolveLocale(forced ?? store.get(LOCALE_COOKIE)?.value);
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Warsaw",
  };
});
