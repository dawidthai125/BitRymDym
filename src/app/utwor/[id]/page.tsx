import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { CommunityThread } from "@/components/community/community-thread";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { loadThread } from "@/lib/community/community-service";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const work = await findLiveCatalogWork(id).catch(() => null);
  const t = await getTranslations("community.works");
  return { title: work?.title ?? t("title") };
}

export default async function FinishedWorkPage({ params }: Props) {
  const { id } = await params;
  const work = await findLiveCatalogWork(id).catch(() => null);
  if (!work) notFound();
  const session = await getCurrentProfile();
  const thread = await loadThread("work", id, session?.userId ?? null).catch(() => null);
  const t = await getTranslations("community.works");
  const catalog = await getTranslations("community.catalog");
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="works" />
          <h1 className="font-poster text-2xl font-bold uppercase">{work.title}</h1>
          <p className="mt-2 text-sm text-[var(--brd-mute)]">{catalog("by", { name: work.author })}</p>
          <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("noPlayer")}</p>
          <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
            {work.allowRatings ? t("ratingsOn") : t("ratingsOff")}
            {" · "}
            {work.allowComments ? t("commentsOn") : t("commentsOff")}
            {work.inRankings ? ` · ${t("inRank")}` : ""}
          </p>
          {thread?.found ? (
            <CommunityThread
              kind="work"
              targetId={work.id}
              signedIn={Boolean(session)}
              own={thread.own}
              enabled={thread.enabled}
              commentsOpen={thread.commentsOpen}
              ratingsOpen={thread.ratingsOpen}
              average={thread.average}
              count={thread.count}
              mine={thread.mine}
              comments={thread.comments}
            />
          ) : null}
        </PageFrame>
      </main>
    </AppShell>
  );
}
