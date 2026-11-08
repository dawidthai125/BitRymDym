import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { FavoriteList } from "@/components/beats/favorite-list";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { listFavoriteBeats } from "@/lib/beats/favorites";
import { getCurrentProfile } from "@/lib/auth/session";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("beats.libraryFavoritesPage");
  return { title: t("metaTitle") };
}

export default async function AccountFavoritesPage() {
  const t = await getTranslations("beats.libraryFavoritesPage");
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");
  const items = await listFavoriteBeats(session.userId);

  return (
    <main className="pb-16">
      <PageFrame className="py-10">
        <SectionLabel>{t("biblioteka")}</SectionLabel>
        <h1 className="brd-display mt-2 text-3xl font-semibold">{t("ulubione")}</h1>
        <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
        <FavoriteList items={items} />
        <Link
          href="/beats"
          className="mt-6 inline-flex min-h-11 items-center text-[var(--brd-green)] hover:underline"
        >
          {t("przegladajBity")}
        </Link>
      </PageFrame>
    </main>
  );
}
