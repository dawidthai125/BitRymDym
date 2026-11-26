import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { intlTag, resolveLocale } from "@/i18n/config";
import { AuthError } from "@/lib/auth/session";
import { loadAdminWorks, type AdminWorksView } from "@/lib/catalog/featured-work-server";

import { RemoveWorkButton } from "../prawa/rights-controls";
import { FeaturedWorkControls } from "./featured-work-controls";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("admin.adminWorksPage");
  return { title: t("metaTitle") };
}

/** Panel Administracyjny → Utwory: published catalogue works + "Utwór tygodnia". ADMIN only. */
export default async function AdminWorksPage() {
  const t = await getTranslations("admin.adminWorksPage");
  const catalog = await getTranslations("community.catalog");
  const works = await getTranslations("community.works");
  const tag = intlTag(resolveLocale(await getLocale()));

  let view: AdminWorksView;
  try {
    view = await loadAdminWorks();
  } catch (error) {
    if (error instanceof AuthError) redirect(error.code === "UNAUTHENTICATED" ? "/sign-in?next=%2Fadmin%2Futwory" : "/admin");
    throw error;
  }
  const day = new Intl.DateTimeFormat(tag, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${view.weekStart}T12:00:00Z`));
  const published = new Intl.DateTimeFormat(tag, { dateStyle: "short", timeZone: "Europe/Warsaw" });

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("opis")}</p>
          <p className="text-sm">{t("tydzien", { date: day })}</p>
          {view.featuredOn ? (
            <p className="text-sm font-medium" data-testid="admin-featured-current">
              {view.currentTitle ? t("obecny", { title: view.currentTitle }) : t("brakWyroznienia")}
            </p>
          ) : (
            <p className="text-sm text-[var(--brd-danger)]">{t("wylaczone")}</p>
          )}
        </header>
        {!view.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("katalogWylaczony")}</p> : null}
        {view.enabled && view.works.length === 0 ? (
          <p className="text-sm text-[var(--brd-ink-soft)]" data-testid="admin-works-empty">{t("pusto")}</p>
        ) : null}
        {view.works.length > 0 ? (
          <ul className="space-y-3">
            {view.works.map((work) => {
              const featured = view.current?.workId === work.id;
              return (
                <li
                  key={work.id}
                  className="grid gap-3 border border-[var(--brd-line)] p-4 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] sm:items-start"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">
                      <Link href={`/utwor/${work.id}`} className="break-words underline underline-offset-4">{work.title}</Link>
                      {featured ? (
                        <span className="ml-2 inline-block border border-[var(--brd-line)] px-1.5 py-0.5 text-xs font-semibold uppercase">
                          {works("featuredBadge")}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-[var(--brd-mute)]">
                      {catalog("by", { name: work.author })} · {published.format(new Date(work.publishedAt))}
                    </p>
                  </div>
                  {view.featuredOn ? (
                    <FeaturedWorkControls
                      workId={work.id}
                      featured={featured}
                      otherFeatured={Boolean(view.current) && !featured}
                      note={featured ? view.current?.note ?? null : null}
                    />
                  ) : null}
                  <RemoveWorkButton workId={work.id} />
                </li>
              );
            })}
          </ul>
        ) : null}
      </PageFrame>
    </main>
  );
}
