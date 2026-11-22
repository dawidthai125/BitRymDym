import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { AppShell } from "@/components/site/app-shell";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/config/site";
import { listPublicWorks } from "@/lib/catalog/catalog-service";
import { loadWorkClips } from "@/lib/catalog/work-clip-server";
import { cn } from "@/lib/utils";

import { WorkClipButton } from "./work-clip-button";
import { worksPageHref, worksPageOf, WORKS_PAGE_SIZE } from "./works-page";

type Props = { searchParams?: Promise<{ strona?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props) {
  const t = await getTranslations("community.works");
  const m = await getTranslations("meta.pages");
  const page = worksPageOf((await searchParams)?.strona);
  const title = page > 1 ? `${t("title")} · ${t("pageLabel", { page })}` : t("title");
  return pageMetadata({ title, description: m("worksDescription"), path: "/utwory" });
}

export default async function FinishedWorksPage({ searchParams }: Props) {
  const t = await getTranslations("community.works");
  const catalog = await getTranslations("community.catalog");
  const page = worksPageOf((await searchParams)?.strona);
  // One extra row tells whether an older page exists (no count query).
  const loaded = await listPublicWorks({ limit: WORKS_PAGE_SIZE + 1, offset: (page - 1) * WORKS_PAGE_SIZE }).catch(() => null);
  const works = loaded?.works.slice(0, WORKS_PAGE_SIZE) ?? [];
  const hasOlder = (loaded?.works.length ?? 0) > WORKS_PAGE_SIZE;
  const clips = works.length > 0 ? await loadWorkClips(works.map((work) => work.id)).catch(() => null) : null;
  const cta = cn(buttonVariants({ variant: "default" }), "min-h-11 px-4");
  const ctaAlt = cn(buttonVariants({ variant: "outline" }), "min-h-11 px-4");
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="works" />
          <h1 className="mb-2 font-poster text-2xl font-bold uppercase">{t("title")}</h1>
          <p className="mb-4 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
          {!loaded || !loaded.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
          {loaded?.enabled && works.length === 0 && page === 1 ? (
            <div className="flex max-w-prose flex-col gap-3" data-testid="works-empty">
              <p className="text-sm">{t("empty")}</p>
              <p className="text-sm text-[var(--brd-ink-soft)]">{t("emptyLead")}</p>
              <div className="flex flex-wrap gap-2">
                <Link href="/beats" className={cta}>{t("emptyRecord")}</Link>
                <Link href="/studio" className={ctaAlt}>{t("emptyStudio")}</Link>
              </div>
            </div>
          ) : null}
          {loaded?.enabled && works.length === 0 && page > 1 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">{t("pageEmpty")}</p>
              <Link href={worksPageHref(1)} className={cn(ctaAlt, "self-start")}>{t("pageFirst")}</Link>
            </div>
          ) : null}
          {works.length > 0 ? (
            <ul className="space-y-3">
              {works.map((work) => {
                const clip = clips?.get(work.id) ?? { state: "pending" as const };
                return (
                  <li key={work.id} className="flex items-start gap-3 border-b border-[var(--brd-line)] pb-3">
                    {clip.state === "ready" ? (
                      <WorkClipButton workId={work.id} title={work.title} errorLabel={t("clipError")} />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-base">
                        <Link href={`/utwor/${work.id}`} className="break-words underline underline-offset-4">{work.title}</Link>
                      </p>
                      <p className="text-sm text-[var(--brd-mute)]">{catalog("by", { name: work.author })}</p>
                      <p className="text-sm text-[var(--brd-ink-soft)]">
                        {clip.state === "ready" ? t("clipBadge", { seconds: clip.seconds }) : t("clipPendingShort")}
                        {" · "}
                        {work.allowRatings ? t("ratingsOn") : t("ratingsOff")}
                        {" · "}
                        {work.allowComments ? t("commentsOn") : t("commentsOff")}
                        {work.inRankings ? ` · ${t("inRank")}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {page > 1 || hasOlder ? (
            <nav aria-label={t("pageNav")} className="mt-5 flex flex-wrap items-center gap-2" data-testid="works-pager">
              {page > 1 ? <Link href={worksPageHref(page - 1)} rel="prev" className={ctaAlt}>{t("pagePrev")}</Link> : null}
              <span className="px-2 text-sm text-[var(--brd-mute)]" aria-current="page">{t("pageLabel", { page })}</span>
              {hasOlder ? <Link href={worksPageHref(page + 1)} rel="next" className={ctaAlt}>{t("pageNext")}</Link> : null}
            </nav>
          ) : null}
        </PageFrame>
      </main>
    </AppShell>
  );
}
