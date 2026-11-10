import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { AppShell } from "@/components/site/app-shell";
import { listPublicWorks } from "@/lib/catalog/catalog-service";

export async function generateMetadata() {
  const t = await getTranslations("community.works");
  return { title: t("title") };
}

export default async function FinishedWorksPage() {
  const t = await getTranslations("community.works");
  const catalog = await getTranslations("community.catalog");
  const loaded = await listPublicWorks().catch(() => null);
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="works" />
          <h1 className="mb-2 font-poster text-2xl font-bold uppercase">{t("title")}</h1>
          <p className="mb-4 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
          {!loaded || !loaded.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
          {loaded?.enabled && loaded.works.length === 0 ? <p className="text-sm">{t("empty")}</p> : null}
          {loaded && loaded.works.length > 0 ? (
            <ul className="space-y-3">
              {loaded.works.map((work) => (
                <li key={work.id} className="border-b border-[var(--brd-line)] pb-3">
                  <p className="text-base">
                    <Link href={`/utwor/${work.id}`} className="underline underline-offset-4">{work.title}</Link>
                  </p>
                  <p className="text-sm text-[var(--brd-mute)]">{catalog("by", { name: work.author })}</p>
                  <p className="text-sm text-[var(--brd-ink-soft)]">
                    {work.allowRatings ? t("ratingsOn") : t("ratingsOff")}
                    {" · "}
                    {work.allowComments ? t("commentsOn") : t("commentsOff")}
                    {work.inRankings ? ` · ${t("inRank")}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </PageFrame>
      </main>
    </AppShell>
  );
}
