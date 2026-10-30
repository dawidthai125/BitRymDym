import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { COOKIES } from "@/content/legal/cookies";

export const metadata: Metadata = { title: COOKIES.title, alternates: { canonical: "/cookies" } };

export default async function Page() {
  const locale = await getLocale();
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={COOKIES} englishNote={locale === "pl" ? null : "This document is available in Polish only; the Polish version is binding."} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
