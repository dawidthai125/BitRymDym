import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { CommunityThread } from "@/components/community/community-thread";
import { BrdAudioDeck } from "@/components/player/brd-audio-deck";
import { ShareButtons } from "@/components/share/share-buttons";
import { AppShell } from "@/components/site/app-shell";
import { getCurrentProfile } from "@/lib/auth/session";
import { findLiveCatalogWork } from "@/lib/catalog/catalog-service";
import { workClipSrc } from "@/lib/catalog/work-clip";
import { loadWorkClips } from "@/lib/catalog/work-clip-server";
import { loadThread } from "@/lib/community/community-service";
import { absoluteUrl, clampText } from "@/lib/share/share-links";
import { getPublicSiteUrl } from "@/lib/site-url";
import { breadcrumbJsonLd, workRecordingJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const work = await findLiveCatalogWork(id).catch(() => null);
  const t = await getTranslations("community.works");
  if (!work) return { title: t("title") };
  const description = clampText(t("shareDescription", { title: work.title, author: work.author }), 200);
  // Card image: ./opengraph-image + ./twitter-image (dynamic; brand card when the work is not live).
  return {
    title: work.title,
    description,
    alternates: { canonical: `/utwor/${work.id}` },
    openGraph: { type: "music.song", title: work.title, description, url: `/utwor/${work.id}` },
    twitter: { card: "summary_large_image", title: work.title, description },
  };
}

export default async function FinishedWorkPage({ params }: Props) {
  const { id } = await params;
  const work = await findLiveCatalogWork(id).catch(() => null);
  if (!work) notFound();
  const session = await getCurrentProfile();
  const [thread, clips] = await Promise.all([
    loadThread("work", id, session?.userId ?? null).catch(() => null),
    loadWorkClips([work.id]).catch(() => null),
  ]);
  const clip = clips?.get(work.id) ?? { state: "pending" as const };
  const t = await getTranslations("community.works");
  const catalog = await getTranslations("community.catalog");
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript
          data={workRecordingJsonLd({
            origin: getPublicSiteUrl(),
            id: work.id,
            title: work.title,
            author: work.author,
            datePublished: work.publishedAt,
            image: `/utwor/${work.id}/opengraph-image`,
          })}
        />
        <JsonLdScript
          data={breadcrumbJsonLd(getPublicSiteUrl(), [
            { name: t("okruszekUtwory"), path: "/utwory" },
            { name: work.title, path: `/utwor/${work.id}` },
          ])}
        />
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="works" />
          <h1 className="font-poster text-2xl font-bold uppercase">{work.title}</h1>
          <p className="mt-2 text-sm text-[var(--brd-mute)]">{catalog("by", { name: work.author })}</p>
          {clip.state === "ready" ? (
            <div className="mt-4 flex max-w-2xl flex-col gap-2">
              <BrdAudioDeck src={workClipSrc(work.id)} title={work.title} seed={work.id} testId="work-clip-player" preload="none" />
              <p className="text-sm text-[var(--brd-ink-soft)]">{t("clipNote", { seconds: clip.seconds })}</p>
            </div>
          ) : (
            <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]" data-testid="work-clip-pending">{t("clipPending")}</p>
          )}
          <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
            {work.allowRatings ? t("ratingsOn") : t("ratingsOff")}
            {" · "}
            {work.allowComments ? t("commentsOn") : t("commentsOff")}
            {work.inRankings ? ` · ${t("inRank")}` : ""}
          </p>
          <div className="mt-4">
            <ShareButtons
              url={absoluteUrl(getPublicSiteUrl(), `/utwor/${work.id}`)}
              text={t("shareText", { title: work.title, author: work.author })}
              title={work.title}
              testId="work-share"
            />
          </div>
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
