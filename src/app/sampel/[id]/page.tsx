import { getLocale, getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf } from "@/components/community/community-shelf";
import { CommunityThread } from "@/components/community/community-thread";
import { SampleCatalog } from "@/components/community/sample-catalog";
import { UseSampleButton } from "@/components/community/use-sample-button";
import { ShareButtons } from "@/components/share/share-buttons";
import { AppShell } from "@/components/site/app-shell";
import type { AppLocale } from "@/i18n/config";
import { getCurrentProfile } from "@/lib/auth/session";
import { findPublicSample, loadThread } from "@/lib/community/community-service";
import { toCatalogSampleItems } from "@/lib/community/sample-items";
import { catalogNumber } from "@/lib/community/share-policy";
import { breadcrumbJsonLd, sampleRecordingJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { localeAlternates, localizedPath } from "@/lib/seo/locale-paths";
import { relatedSamples, sampleDescription, sampleMetaTitle, type SampleMetaInput } from "@/lib/seo/sample-meta";
import { absoluteUrl, clampText } from "@/lib/share/share-links";
import { getPublicSiteUrl } from "@/lib/site-url";

type Props = { params: Promise<{ id: string }> };

/** One load per request, shared by metadata and the page. */
const loadSample = cache(async (id: string) => {
  const found = await findPublicSample(id);
  if (!found) return null;
  const [t, tl, locale] = await Promise.all([getTranslations("community.catalog"), getTranslations("studio.sampleLab"), getLocale()]);
  const items = toCatalogSampleItems(found.siblings, {
    by: (name) => t("by", { name }),
    instrument: (key) => (key && tl.has(`instrument.${key}`) ? tl(`instrument.${key}`) : key),
    type: (key) => (key && tl.has(`typ.${key}`) ? tl(`typ.${key}`) : null),
    bars: (n) => tl("taktow", { n }),
  });
  const item = items.find((i) => i.id === id);
  if (!item) return null;
  const meta: SampleMetaInput = { ...item, locale: locale === "en" ? "en" : "pl" };
  return { item, items, card: found.sample, meta, locale: locale as AppLocale };
});

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const data = await loadSample(id);
  if (!data) return { title: (await getTranslations("community.shelf"))("samples"), robots: { index: false } };
  const title = sampleMetaTitle(data.meta);
  const description = clampText(sampleDescription(data.meta)[0]!, 158);
  return {
    title,
    description,
    alternates: localeAlternates(data.locale, `/sampel/${id}`),
    openGraph: { type: "music.song", title, description, url: localizedPath(data.locale, `/sampel/${id}`) },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SamplePage({ params }: Props) {
  const { id } = await params;
  const data = await loadSample(id);
  if (!data) notFound();
  const { item, items, card, meta } = data;
  const [ts, shelf, session] = await Promise.all([
    getTranslations("community.sampleCatalog"),
    getTranslations("community.shelf"),
    getCurrentProfile(),
  ]);
  const thread = await loadThread("sample", id, session?.userId ?? null).catch(() => null);
  const origin = getPublicSiteUrl();
  const copy = sampleDescription(meta);
  const facts = [
    [ts("typ"), item.typeLabel],
    [ts("instrument"), item.instrumentLabel],
    ["BPM", item.bpm ? String(Math.round(item.bpm)) : null],
    [ts("takty"), item.bars ? String(item.bars) : null],
    [ts("tonacja"), item.musicalKey],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <JsonLdScript
          data={sampleRecordingJsonLd({
            origin,
            id,
            title: item.title,
            author: card.author,
            durationSeconds: item.durationMs / 1000,
            bpm: item.bpm,
            musicalKey: item.musicalKey,
            description: copy[0],
            datePublished: card.createdAt,
          })}
        />
        <JsonLdScript
          data={breadcrumbJsonLd(origin, [
            { name: shelf("samples"), path: "/sampel" },
            { name: item.title, path: `/sampel/${id}` },
          ])}
        />
        <PageFrame className="py-5 sm:py-6">
          <CommunityShelf current="samples" />
          <Link
            href={`/sampel?zrodlo=${item.platform ? "brd" : "user"}`}
            className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
          >
            {ts("wrocDoKatalogu")}
          </Link>
          <h1 className="brd-display mt-2 text-[length:var(--tape-text-xl)] leading-[0.95]">
            <span className="text-[var(--brd-mute)]">{catalogNumber(item.no)}</span> {item.title}
          </h1>
          <div className="mt-4" data-testid="sample-player">
            <SampleCatalog items={[item]} signedIn={Boolean(session)} isAdmin={false} instruments={[]} types={[]} showTalk={false} showFilters={false} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <UseSampleButton sampleId={id} signedIn={Boolean(session)} />
            <p className="text-sm text-[var(--brd-mute)]">{ts("tylkoStudio")}</p>
          </div>
          <section aria-labelledby="sample-about" className="mt-8 max-w-3xl space-y-3 text-[var(--brd-ink-soft)]" data-testid="sample-description">
            <h2 id="sample-about" className="brd-display text-2xl text-[var(--brd-ink)]">{ts("oSamplu")}</h2>
            {copy.map((p) => (
              <p key={p}>{p}</p>
            ))}
            {facts.length > 0 ? (
              <dl className="grid grid-cols-2 gap-3 pt-2 sm:grid-cols-3">
                {facts.map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-[var(--brd-mute)]">{label}</dt>
                    <dd className="text-[var(--brd-ink)]">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
          <section aria-labelledby="sample-related" className="mt-8">
            <h2 id="sample-related" className="brd-display text-2xl">{ts("podobne")}</h2>
            <ul className="mt-2 flex flex-wrap gap-x-5">
              {relatedSamples(item, items).map((s) => (
                <li key={s.id}>
                  <Link href={`/sampel/${s.id}`} className="inline-flex min-h-11 items-center underline underline-offset-4">
                    {catalogNumber(s.no)} {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <div className="mt-6 border-t border-[var(--brd-line)] pt-4">
            <ShareButtons url={absoluteUrl(origin, `/sampel/${id}`)} text={`${item.title} — BitRymDym`} testId="sample-share" />
          </div>
          {thread?.found ? (
            <CommunityThread
              kind="sample"
              targetId={id}
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
