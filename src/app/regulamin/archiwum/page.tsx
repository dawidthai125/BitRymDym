import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import Link from "@/components/ui/app-link";
import { TERMS_ARCHIVE } from "@/content/legal/archive";
import { LEGAL_PATHS } from "@/lib/legal/legal-config";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.legal");
  return { title: t("archiwumTytul"), robots: { index: false } };
}

export default async function Page() {
  const t = await getTranslations("common.legal");
  return (
    <AppShell>
      <main>
        <PageFrame>
          <div className="mx-auto max-w-3xl space-y-6 py-10">
            <h1 className="text-3xl font-bold tracking-tight">{t("archiwumTytul")}</h1>
            <p className="text-[var(--brd-mute)]">
              <Link href={LEGAL_PATHS.terms} className="underline underline-offset-4">{t("archiwumLead")}</Link>
            </p>
            <ul className="flex flex-col" data-testid="terms-archive">
              {TERMS_ARCHIVE.map((doc) => (
                <li key={doc.version}>
                  <Link href={`${LEGAL_PATHS.archive}/${doc.version}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                    {t("archiwumWersja", { v: doc.version })}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
