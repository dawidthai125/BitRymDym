import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/site/app-shell";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { getCurrentProfile } from "@/lib/auth/session";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("beats.libraryFavoritesPage");
  return { title: t("metaTitle") };
}

export default async function LibraryFavoritesPage() {
  const t = await getTranslations("beats.libraryFavoritesPage");
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>{t("biblioteka")}</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">{t("ulubione")}</h1>
          <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {t("listaUlubionychBitowPojawi")}
          </p>
          <Link
            href="/beats"
            className="mt-6 inline-flex min-h-11 items-center text-[var(--brd-green)] hover:underline"
          >
            {t("przegladajBity")}
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
