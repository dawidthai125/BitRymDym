import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { COOKIES_EN } from "@/content/legal/en/cookies";
import { COOKIES } from "@/content/legal/cookies";
import { LEGAL_TRANSLATION_NOTE_EN } from "@/lib/legal/legal-config";
import type { AppLocale } from "@/i18n/config";
import { localeAlternates } from "@/lib/seo/locale-paths";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  return { title: (locale === "en" ? COOKIES_EN : COOKIES).title, alternates: localeAlternates(locale, "/cookies") };
}

export default async function Page() {
  const en = (await getLocale()) === "en";
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={en ? COOKIES_EN : COOKIES} lang={en ? "en" : "pl"} englishNote={en ? LEGAL_TRANSLATION_NOTE_EN : null} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
