import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { PRIVACY } from "@/content/legal/privacy";

export const metadata: Metadata = { title: PRIVACY.title, alternates: { canonical: "/polityka-prywatnosci" } };

export default async function Page() {
  const locale = await getLocale();
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={PRIVACY} englishNote={locale === "pl" ? null : "This document is available in Polish only; the Polish version is binding."} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
