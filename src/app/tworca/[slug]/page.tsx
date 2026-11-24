import { getLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { WorkClipButton } from "@/app/utwory/work-clip-button";
import { BeatCatalogRow } from "@/components/brand/beat-catalog-row";
import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { SampleCatalog } from "@/components/community/sample-catalog";
import { ShareButtons } from "@/components/share/share-buttons";
import { AppShell } from "@/components/site/app-shell";
import { SocialIcon } from "@/components/site/social-icon";
import Link from "@/components/ui/app-link";
import { buttonVariants } from "@/components/ui/button";
import { pageMetadata } from "@/config/site";
import { getLibText } from "@/i18n/get-lib-text";
import { intlTag, resolveLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth/session";
import { listFavoriteBeatIds } from "@/lib/beats/favorites";
import { toCatalogSampleItems } from "@/lib/community/sample-items";
import { CREATOR_SERVICE_LABEL, CREATOR_SERVICES } from "@/lib/creators/creator-links";
import { findCreator, loadCreatorFacts } from "@/lib/creators/creator-profile-server";
import { hasPublicItem, type CreatorPlace } from "@/lib/creators/profile-policy";
import { absoluteUrl } from "@/lib/share/share-links";
import { getPublicSiteUrl } from "@/lib/site-url";
import { labelCreatorRank } from "@/lib/ui/labels";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ slug: string }> };

const REPORT_EMAIL = "kontakt@bitrymdym.pl";

/** The profile for this viewer: live for everyone, switched off only for its owner (preview). */
async function creatorFor(slug: string) {
  const view = await findCreator(slug);
  if (!view) return null;
  const session = await getCurrentProfile();
  const own = session?.userId === view.ownerId;
  return view.live || own ? { view, own, session } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const [t, found] = await Promise.all([getTranslations("community.creator"), creatorFor(slug)]);
  if (!found) return { title: t("kicker"), robots: { index: false } };
  const { view } = found;
  const indexable = view.live && hasPublicItem(await loadCreatorFacts(view));
  return {
    ...(await pageMetadata({
      title: t("metaTitle", { name: view.name }),
      description: t("metaDescription", { name: view.name }),
      path: view.path,
    })),
    ...(indexable ? {} : { robots: { index: false, follow: view.live } }),
  };
}

function placeHref(place: CreatorPlace): string {
  if (place.kind === "beat") return `/beat/${place.targetId}`;
  return place.kind === "sample" ? `/sampel/${place.targetId}` : `/utwor/${place.targetId}`;
}

function boardHref(place: CreatorPlace): string {
  const base = place.kind === "beat" ? "/ranking" : place.kind === "sample" ? "/ranking/sampel" : "/ranking/utwor";
  return place.period === "month" ? `${base}?okres=miesiac` : place.period === "all" ? `${base}?okres=ogolny` : base;
}

export default async function CreatorPage({ params }: Props) {
  const { slug } = await params;
  const found = await creatorFor(slug);
  if (!found) notFound();
  const { view, own, session } = found;
  if (`/tworca/${slug}` !== view.path) permanentRedirect(view.path);

  const [t, tw, tl, samplesT, lab, catalog, locale, facts] = await Promise.all([
    getTranslations("community.creator"),
    getTranslations("community.works"),
    getLibText(),
    getTranslations("community.sampleCatalog"),
    getTranslations("studio.sampleLab"),
    getTranslations("community.catalog"),
    getLocale(),
    loadCreatorFacts(view),
  ]);
  const beats = facts.beats?.items ?? [];
  const favoriteIds = session && beats.length > 0 ? await listFavoriteBeatIds(session.userId).catch(() => []) : [];
  const sampleItems = facts.samples
    ? toCatalogSampleItems(facts.samples.items, {
        by: (name) => catalog("by", { name }),
        instrument: (id) => (id && lab.has(`instrument.${id}`) ? lab(`instrument.${id}`) : id),
        type: (id) => (id && lab.has(`typ.${id}`) ? lab(`typ.${id}`) : null),
        bars: (n) => lab("taktow", { n }),
      })
    : [];
  const works = facts.works?.items ?? [];
  const places = facts.places;
  const links = CREATOR_SERVICES.flatMap((service) => (view.links[service] ? [{ service, href: view.links[service] }] : []));
  const stats = [
    { id: "trackCount" as const, value: facts.trackCount },
    { id: "recordingCount" as const, value: facts.recordingCount },
    { id: "beats" as const, value: facts.beats?.total ?? null },
    { id: "samples" as const, value: facts.samples?.total ?? null },
    // The same number as trackCount, so it is shown once.
    { id: "works" as const, value: facts.trackCount === null ? (facts.works?.total ?? null) : null },
  ].flatMap(({ id, value }) => (value === null ? [] : [{ id, value }]));
  const joined = view.joinedMonth
    ? new Date(`${view.joinedMonth}T12:00:00Z`).toLocaleDateString(intlTag(resolveLocale(locale)), { month: "long", year: "numeric", timeZone: "UTC" })
    : null;
  const empty = stats.length === 0 && links.length === 0 && !places && !view.experience && !joined;
  const h2 = "font-poster text-xl font-bold uppercase";
  const more = (shown: number, total: number) =>
    total > shown ? <p className="mt-2 text-sm text-[var(--brd-mute)]">{t("latest", { shown, total })}</p> : null;

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="none" />
          {own && !view.live ? (
            <p role="status" className="mb-5 border border-[var(--brd-line)] p-4 text-sm" data-testid="creator-preview">
              {t(view.blocked ? "previewBlocked" : "preview")}
            </p>
          ) : null}
          <header className="flex flex-col gap-4 border-b-4 border-[var(--brd-ink)] pb-5">
            <div className="min-w-0 space-y-3">
              <p className="brd-meta text-xs uppercase tracking-[0.14em] text-[var(--brd-green)]">{t("kicker")}</p>
              <h1 className="brd-display break-words text-[length:var(--tape-text-xl)] leading-[0.95]">{view.name}</h1>
              {view.experience ? (
                <p className="text-base text-[var(--brd-ink-soft)]">
                  {t("level", { rank: tl(labelCreatorRank(view.experience.rank)), points: view.experience.total })}
                </p>
              ) : null}
              {joined ? <p className="text-sm text-[var(--brd-mute)]">{t("joined", { month: joined })}</p> : null}
            </div>
            {links.length > 0 ? (
              <ul aria-label={t("linksAria")} className="flex flex-wrap gap-2" data-testid="creator-links">
                {links.map(({ service, href }) => (
                  <li key={service}>
                    <a
                      href={href}
                      target="_blank"
                      rel="nofollow ugc noopener noreferrer"
                      aria-label={t("openLink", { name: view.name, service: CREATOR_SERVICE_LABEL[service] })}
                      title={CREATOR_SERVICE_LABEL[service]}
                      className="inline-flex size-11 items-center justify-center border border-[var(--brd-line)] text-[var(--brd-ink)] hover:border-[var(--brd-ink)]"
                    >
                      <SocialIcon name={CREATOR_SERVICE_LABEL[service]} className="size-5" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
            {own ? (
              <Link href="/account/profil" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 self-start px-4")}>
                {t("edit")}
              </Link>
            ) : null}
          </header>

          {empty ? <p className="mt-6 text-sm">{t(own ? "emptyOwn" : "empty")}</p> : null}

          {stats.length > 0 ? (
            <section aria-labelledby="creator-stats" className="mt-6">
              <h2 id="creator-stats" className={h2}>{t("statsTitle")}</h2>
              <dl className="mt-3 grid grid-cols-2 gap-px border border-[var(--brd-line)] bg-[var(--brd-line)] sm:grid-cols-4">
                {stats.map(({ id, value }) => (
                  <div key={id} className="bg-[var(--brd-paper)] px-4 py-3">
                    <dt className="text-xs text-[var(--brd-mute)]">{t(`stat.${id}`)}</dt>
                    <dd className="brd-data mt-1 text-2xl text-[var(--brd-ink)]">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {places ? (
            <section aria-labelledby="creator-places" className="mt-8">
              <h2 id="creator-places" className={h2}>{t("placesTitle")}</h2>
              {places.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--brd-mute)]">{t("placesEmpty")}</p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {places.map((place) => (
                    <li key={`${place.kind}-${place.period}-${place.targetId}`} className="border-b border-[var(--brd-line)] pb-3">
                      <p className="text-sm text-[var(--brd-mute)]">
                        {t("place", { place: place.place })}
                        {" · "}
                        <Link href={boardHref(place)} className="py-2 underline underline-offset-4">{t(`board.${place.kind}.${place.period}`)}</Link>
                      </p>
                      <p className="text-base">
                        <Link href={placeHref(place)} className="break-words py-2 underline underline-offset-4">{place.title}</Link>
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          {works.length > 0 ? (
            <section aria-labelledby="creator-works" className="mt-8">
              <h2 id="creator-works" className={h2}>{t("worksTitle")}</h2>
              <ul className="mt-3 space-y-3">
                {works.map((work) => (
                  <li key={work.id} className="flex items-start gap-3 border-b border-[var(--brd-line)] pb-3">
                    {work.clipSeconds !== null ? <WorkClipButton workId={work.id} title={work.title} errorLabel={tw("clipError")} /> : null}
                    <div className="min-w-0 flex-1">
                      <p className="text-base">
                        <Link href={`/utwor/${work.id}`} className="break-words underline underline-offset-4">{work.title}</Link>
                      </p>
                      <p className="text-sm text-[var(--brd-ink-soft)]">
                        {work.clipSeconds !== null ? tw("clipBadge", { seconds: work.clipSeconds }) : tw("clipPendingShort")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {more(works.length, facts.works?.total ?? 0)}
            </section>
          ) : null}

          {beats.length > 0 ? (
            <section aria-labelledby="creator-beats" className="mt-8">
              <h2 id="creator-beats" className={h2}>{t("beatsTitle")}</h2>
              <ul className="mt-3">
                {beats.map((beat) => (
                  <BeatCatalogRow key={beat.id} beat={beat} favorited={favoriteIds.includes(beat.id)} signedIn={Boolean(session)} />
                ))}
              </ul>
              {more(beats.length, facts.beats?.total ?? 0)}
            </section>
          ) : null}

          {sampleItems.length > 0 ? (
            <section aria-labelledby="creator-samples" className="mt-8">
              <h2 id="creator-samples" className={h2}>{t("samplesTitle")}</h2>
              <p className="mb-3 mt-1 text-sm text-[var(--brd-mute)]">{samplesT("tylkoStudio")}</p>
              <SampleCatalog items={sampleItems} signedIn={Boolean(session)} isAdmin={false} instruments={[]} types={[]} showTalk={false} showFilters={false} linkTitles />
              {more(sampleItems.length, facts.samples?.total ?? 0)}
            </section>
          ) : null}

          {view.live ? (
            <div className="mt-8 border-t border-[var(--brd-line)] pt-4">
              <ShareButtons
                url={absoluteUrl(getPublicSiteUrl(), view.path)}
                text={t("shareText", { name: view.name })}
                title={t("metaTitle", { name: view.name })}
                testId="creator-share"
              />
            </div>
          ) : null}
          {own ? null : (
            <p className="mt-4">
              <a
                href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(t("reportSubject", { path: view.path }))}`}
                className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] underline underline-offset-4"
              >
                {t("report")}
              </a>
            </p>
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}
