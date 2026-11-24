import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { LegalDocument } from "@/components/legal/legal-document";
import { AppShell } from "@/components/site/app-shell";
import { TERMS_ARCHIVE } from "@/content/legal/archive";

type Props = { params: Promise<{ wersja: string }> };

const find = (version: string) => TERMS_ARCHIVE.find((doc) => doc.version === version) ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const doc = find((await params).wersja);
  return { title: doc ? `${doc.title} (${doc.version})` : undefined, robots: { index: false } };
}

export default async function Page({ params }: Props) {
  const doc = find((await params).wersja);
  if (!doc) notFound();
  const locale = await getLocale();
  return (
    <AppShell>
      <main>
        <PageFrame>
          <LegalDocument doc={doc} englishNote={locale === "pl" ? null : "This document is available in Polish only; the Polish version is binding."} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
