import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { PRIVACY_EN } from "@/content/legal/en/privacy";
import { PRIVACY } from "@/content/legal/privacy";
import { LEGAL_TRANSLATION_NOTE_EN } from "@/lib/legal/legal-config";
import type { AppLocale } from "@/i18n/config";
import { localeAlternates } from "@/lib/seo/locale-paths";

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getLocale()) as AppLocale;
  return { title: (locale === "en" ? PRIVACY_EN : PRIVACY).title, alternates: localeAlternates(locale, "/polityka-prywatnosci") };
}

export default async function Page() {
  const en = (await getLocale()) === "en";
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={en ? PRIVACY_EN : PRIVACY} lang={en ? "en" : "pl"} englishNote={en ? LEGAL_TRANSLATION_NOTE_EN : null} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
