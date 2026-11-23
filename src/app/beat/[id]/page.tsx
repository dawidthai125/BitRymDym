import { getLibText } from "@/i18n/get-lib-text";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";

import { BeatDetailClient } from "@/app/beat/[id]/beat-detail-client";
import { CommunityShelf } from "@/components/community/community-shelf";
import { CommunityThread } from "@/components/community/community-thread";
import { PageFrame } from "@/components/brand/chrome";
import { LicenseSummary } from "@/components/site/license-summary";
import { ShareButtons } from "@/components/share/share-buttons";
import type { LockReason } from "@/components/plans/locked-action";
import { AppShell } from "@/components/site/app-shell";
import { E3_MIX_ENABLED } from "@/config/audio-render";
import { hasRole } from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { toPublicBeatDetail, toPublicCatalogItem } from "@/lib/beats/public";
import { getPublishedBeat, listPublishedBeats } from "@/lib/beats/service";
import { loadThread } from "@/lib/community/community-service";
import { getBeatAudioPublicInfo } from "@/lib/beats/audio-service";
import { hasAudioCapability } from "@/lib/audio/effective-entitlement";
import { resolveAudioEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import { loadSamplePolicyDurationOverrides } from "@/lib/takes/sample-policy-settings";
import { listOwnTakesFor } from "@/lib/takes/list-own-takes";
import { presentBeat, presentBeats } from "@/lib/ui/demo-beats";
import { absoluteUrl, clampText } from "@/lib/share/share-links";
import { getPublicSiteUrl } from "@/lib/site-url";
import { beatRecordingJsonLd, breadcrumbJsonLd } from "@/lib/seo/json-ld";
import { genrePagePath, genreSlug } from "@/lib/seo/genre-pages";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import {
  canDownloadBeatByOwnerChoice,
  canUseBeatInStudio,
} from "@/lib/beats/usage/beat-usage-policy";
import { hasActiveRecordGrant } from "@/lib/grants/beat-access-grants";
import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { loadBeatSale } from "@/lib/payments/beat-sale";
import { prewarmListenCopy } from "@/lib/beats/listen-copy/listen-copy-server";
import { formatBeatWavPrice } from "@/lib/payments/money";
import { isStoreApp } from "@/lib/site/store-app-server";
import { isPayuConfigured } from "@/lib/payments/payu-config";
import { readPlanPaymentsAvailable } from "@/config/plan-policy";

type BeatDetailPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: BeatDetailPageProps) {
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) {
    const t = await getTranslations("beats.beatPage");
    return { title: t("beatUnavailable") };
  }
  const presented = presentBeat(toPublicBeatDetail(beat));
  const description = clampText(beat.description, 200) || `Odsłuch: ${presented.title}`;
  // Card image: ./opengraph-image + ./twitter-image (dynamic, beat cover when public).
  return {
    title: presented.title,
    description,
    alternates: { canonical: `/beat/${id}` },
    // Private user beats open by link only; keep them out of search results.
    ...(beat.visibility === "private" ? { robots: { index: false, follow: false } } : {}),
    openGraph: { type: "music.song", title: presented.title, description, url: `/beat/${id}` },
    twitter: { card: "summary_large_image", title: presented.title, description },
  };
}

export default async function BeatDetailPage({ params }: BeatDetailPageProps) {
  const tl = await getLibText();
  const tr = await getTranslations("beats.beatPage");
  const tg = await getTranslations("beats.genrePage");
  const { id } = await params;
  const beat = await getPublishedBeat(id);
  if (!beat) notFound();
  const relatedPromise = listPublishedBeats({ limit: 8, excludeId: beat.id });

  const detail = toPublicBeatDetail(beat);
  const presented = presentBeat(detail);
  const audioInfo = await getBeatAudioPublicInfo(beat.id);
  const session = await getCurrentProfile();
  const overrides = await loadSamplePolicyDurationOverrides();
  // User beats 2026-10-30: owner usage settings (server enforces too).
  const viewerId = session?.userId ?? null;
  const viewerIsStaff = session
    ? hasRole(session.profile.role, ["ADMIN", "MODERATOR"])
    : false;
  const usageSubject = {
    status: beat.status,
    ownershipType: beat.ownershipType,
    ownerId: beat.ownerId,
    visibility: beat.visibility,
    allowDownload: beat.allowDownload,
    allowStudioUse: beat.allowStudioUse,
    catalogLane: beat.catalogLane,
  };
  const restricted =
    beat.ownershipType === "USER" &&
    beat.ownerId !== viewerId &&
    (beat.visibility === "private" || beat.allowStudioUse === false);
  const viewerHasGrant =
    restricted && viewerId
      ? await hasActiveRecordGrant({ beatId: beat.id, granteeUserId: viewerId })
      : false;
  const paidLane = beat.ownershipType === "PLATFORM" && catalogLaneOf(beat.catalogLane) === "paid";
  const sale = paidLane ? await loadBeatSale(beat.id, viewerId).catch(() => null) : null;
  const studioUseAllowed = canUseBeatInStudio(usageSubject, {
    userId: viewerId,
    isStaff: viewerIsStaff,
    hasActiveGrant: viewerHasGrant,
    hasPurchasedWav: Boolean(sale?.owned),
  }).allowed;
  // A listener who may record here gets a personal marked copy; start rendering it now (Studio opens faster).
  if (viewerId && !viewerIsStaff && beat.ownerId !== viewerId && studioUseAllowed && !(paidLane && sale?.owned)) {
    const warmFor = viewerId;
    after(() => prewarmListenCopy({ beatId: beat.id, userId: warmFor }));
  }
  const downloadByOwner = canDownloadBeatByOwnerChoice(usageSubject, {
    userId: viewerId,
    isStaff: viewerIsStaff,
    hasActiveGrant: viewerHasGrant,
  }).allowed;
  let maxRecordingSeconds: number;
  // Owner 2026-10-29: guests and Free listen only — the button stays, locked.
  let downloadLock: LockReason | null = session ? null : "guest";
  if (session) {
    const product = await resolveProductEntitlementForAuthContext(session);
    if (session.profile.role !== "ADMIN" && !(product.limits.downloadsDaily > 0)) {
      downloadLock = "plan";
    }
    if (beat.ownershipType === "USER" && !downloadByOwner) {
      downloadLock = "owner";
    }
    maxRecordingSeconds = getSamplePolicy({
      actor: sampleActorFromPremiumTier(product.premiumTier),
      beatDurationSeconds: detail.durationSeconds,
      overrides,
    }).maxRecordingSeconds;
  } else {
    maxRecordingSeconds = getSamplePolicy({
      actor: "ANONYMOUS",
      beatDurationSeconds: detail.durationSeconds,
    }).maxRecordingSeconds;
  }

  let mixTakes: Array<{
    id: string;
    label: string;
    durationSeconds: number | null;
  }> = [];
  let mixPro = false;
  let masterPro = false;
  if (session) {
    try {
      const entitlement = await resolveAudioEntitlementForAuthContext(session);
      mixPro = hasAudioCapability(entitlement, "MIX_PRO");
      masterPro = hasAudioCapability(entitlement, "MASTER_PRO");
      const own = await listOwnTakesFor(session);
      mixTakes = own
        .filter((t) => t.beatId === detail.id && t.canPreview)
        .map((t) => ({
          id: t.id,
          label: tr("probaS", { v0: t.durationSeconds ?? "?" }),
          durationSeconds: t.durationSeconds,
        }));
    } catch {
      mixTakes = [];
    }
  }

  const locale = await getLocale();
  // Store app: no price and no checkout in the HTML (owned WAVs still download).
  const storeApp = await isStoreApp();
  const wavSale = sale
    ? {
        price: storeApp ? "" : formatBeatWavPrice(locale),
        owned: sale.owned,
        paymentsOn: !storeApp && readPlanPaymentsAvailable() && isPayuConfigured(),
        fileReady: sale.fileReady,
        signInHref: signInPathWithNext(`/beat/${beat.id}#zakup`),
        locale: locale === "en" ? ("en" as const) : ("pl" as const),
      }
    : null;

  const thread = await loadThread("beat", beat.id, viewerId).catch(() => null);
  const related = presentBeats(
    (await relatedPromise).map(toPublicCatalogItem).slice(0, 6),
  );

  const jsonLd =
    beat.visibility === "private"
      ? null
      : beatRecordingJsonLd({
          origin: getPublicSiteUrl(),
          id: beat.id,
          title: presented.title,
          producer: presented.producer,
          genre: presented.genre,
          style: beat.style,
          tags: beat.tags,
          bpm: presented.bpm,
          musicalKey: presented.key,
          durationSeconds: presented.durationSeconds,
          description: clampText(beat.description, 300),
          image: detail.coverFullUrl ?? `/beat/${beat.id}/opengraph-image`,
          datePublished: beat.createdAt,
          dateModified: beat.updatedAt,
        });

  // Free public beats link to their genre landing page (internal linking + breadcrumb).
  const genreSlugValue =
    beat.visibility !== "private" && catalogLaneOf(beat.catalogLane) === "free" ? genreSlug(presented.genre) : null;
  const genreLink = genreSlugValue && presented.genre
    ? { href: genrePagePath(genreSlugValue), label: presented.genre.trim() }
    : null;
  const breadcrumb = jsonLd
    ? breadcrumbJsonLd(getPublicSiteUrl(), [
        { name: tg("okruszekBity"), path: "/beats" },
        ...(genreLink ? [{ name: tg("h1", { genre: genreLink.label }), path: genreLink.href }] : []),
        { name: presented.title, path: `/beat/${beat.id}` },
      ])
    : null;

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        {jsonLd ? <JsonLdScript data={jsonLd} /> : null}
        {breadcrumb ? <JsonLdScript data={breadcrumb} /> : null}
        <PageFrame className="py-6 sm:py-8">
          <CommunityShelf current="beats" />
          <Link
            href="/beats?zrodlo=brd"
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            {tr("katalog")}
          </Link>
          {genreLink ? (
            <Link
              href={genreLink.href}
              className="ml-4 inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] underline underline-offset-4 hover:text-[var(--brd-ink)]"
              data-testid="beat-genre-link"
            >
              {tg("h1", { genre: genreLink.label })}
            </Link>
          ) : null}
          <div className="mt-4">
            <BeatDetailClient
              beat={presented}
              description={tl(detail.description)}
              hasAudio={audioInfo.hasAudio}
              isAuthenticated={Boolean(session)}
              originalMasterDownloadAllowed={beat.ownershipType === "USER"}
              wavSale={wavSale}
              downloadLock={
                beat.ownershipType === "USER" && !downloadByOwner
                  ? "owner"
                  : downloadLock
              }
              studioUseAllowed={studioUseAllowed}
              maxRecordingSeconds={maxRecordingSeconds}
              mixTakes={mixTakes}
              mixEnabled={E3_MIX_ENABLED === true}
              mixPro={mixPro}
              masterPro={masterPro}
              related={related}
            />
          </div>
          <LicenseSummary className="mt-6 border-t border-[var(--brd-line)] pt-4" />
          <div className="mt-6 border-t border-[var(--brd-line)] pt-4">
            <ShareButtons url={absoluteUrl(getPublicSiteUrl(), `/beat/${detail.id}`)} text={`${presented.title} — BitRymDym`} testId="beat-share" />
          </div>
          {thread?.found ? (
            <CommunityThread
              kind="beat"
              targetId={beat.id}
              signedIn={Boolean(session)}
              own={thread.own}
              enabled={thread.enabled}
              commentsOpen={thread.commentsOpen}
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
