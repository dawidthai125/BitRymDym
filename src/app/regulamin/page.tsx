import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { TERMS } from "@/content/legal/terms";

export const metadata: Metadata = { title: TERMS.title, alternates: { canonical: "/regulamin" } };

export default async function Page() {
  const locale = await getLocale();
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={TERMS} englishNote={locale === "pl" ? null : "This document is available in Polish only; the Polish version is binding."} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
