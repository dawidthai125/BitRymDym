import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";

import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf, CommunitySource } from "@/components/community/community-shelf";
import { SampleCatalog } from "@/components/community/sample-catalog";
import { SamplePromoFilm } from "@/components/community/sample-promo-film";
import { AuthorName } from "@/components/creators/author-name";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { listPublicSamples, pickSampleOfTheWeek } from "@/lib/community/community-service";
import { itemListJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { getPublicSiteUrl } from "@/lib/site-url";
import { toCatalogSampleItems } from "@/lib/community/sample-items";
import { parseCatalogSource } from "@/lib/community/share-policy";
import { parseCatalogPage } from "@/lib/ui/paginate";
import { LIVE_SAMPLE_INSTRUMENTS, SAMPLE_INSTRUMENTS, SAMPLE_TYPES } from "@/lib/studio/samples/sample-policy";

type Props = { searchParams?: Promise<{ zrodlo?: string; strona?: string }> };

export async function generateMetadata({ searchParams }: Props) {
  const m = await getTranslations("meta.pages");
  const params = (await searchParams) ?? {};
  const page = parseCatalogSource(params.zrodlo) === "user" ? 1 : parseCatalogPage(params.strona);
  const title = page > 1 ? `${m("samplesTitle")} · ${m("strona", { page })}` : m("samplesTitle");
  return pageMetadata({ title, description: m("samplesDescription"), path: "/sampel", page });
}

export default async function SampleCatalogPage({ searchParams }: Props) {
  const t = await getTranslations("community.catalog");
  const tl = await getTranslations("studio.sampleLab");
  const ts = await getTranslations("community.sampleCatalog");
  const shelfT = await getTranslations("community.shelf");
  const params = searchParams ? await searchParams : {};
  const source = parseCatalogSource(params.zrodlo);
  const session = await getCurrentProfile();
  const isAdmin = session?.profile.role === "ADMIN";
  const samples = await listPublicSamples(source).catch(() => []);

  const instrumentLabel = (id: string | null) => (id && tl.has(`instrument.${id}`) ? tl(`instrument.${id}`) : id);
  const typeLabel = (id: string | null) => (id && tl.has(`typ.${id}`) ? tl(`typ.${id}`) : null);
  const items = toCatalogSampleItems(samples, {
    by: (name) => t("by", { name }),
    instrument: instrumentLabel,
    type: typeLabel,
    bars: (n) => tl("taktow", { n }),
  });
  const best = source === "user" ? pickSampleOfTheWeek(samples) : null;
  const bestItem = best ? items.find((i) => i.id === best.id) ?? null : null;
  const instruments = [...SAMPLE_INSTRUMENTS, ...LIVE_SAMPLE_INSTRUMENTS].map((o) => ({ id: o.id, label: instrumentLabel(o.id) ?? o.id }));
  const types = SAMPLE_TYPES.map((id) => ({ id, label: typeLabel(id) ?? id }));

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        {source === "brd" && items.length > 0 ? (
          <JsonLdScript data={itemListJsonLd(getPublicSiteUrl(), { name: shelfT("samples"), path: "/sampel", items: items.map((i) => ({ path: `/sampel/${i.id}`, name: i.title })), max: 100 })} />
        ) : null}
        <PageFrame width="wide" className="py-5 sm:py-6">
          <h1 className="sr-only">{shelfT("samples")}</h1>
          <CommunityShelf current="samples" />
          <SamplePromoFilm />
          <CommunitySource kind="samples" source={source} />
          <div className="mb-4 flex flex-wrap items-stretch gap-3">
            {bestItem && best ? (
              <div className="relative flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-[var(--brd-amber)] bg-[var(--brd-amber)]/10 px-4 py-3"
              >
                <span className="text-xs uppercase tracking-wide text-[var(--brd-amber)]">{ts("tygodnia")}</span>
                <a href={`#${bestItem.id}`} className="truncate text-base text-[var(--brd-ink)] after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-current">
                  #{String(bestItem.no).padStart(2, "0")} {bestItem.title}
                </a>
                <span className="text-xs text-[var(--brd-mute)]">
                  <AuthorName name={best.author} href={best.authorHref} label={bestItem.author} />
                  {" · "}
                  {best.weekCount >= 2
                    ? ts("tygodniaOcena", { avg: (best.weekAvg ?? 0).toFixed(1), count: best.weekCount })
                    : ts("tygodniaNajczesciej", { avg: (best.ratingAvg ?? 0).toFixed(1), count: best.ratingCount })}
                </span>
              </div>
            ) : null}
            <Link
              href="/ranking/sampel"
              className="inline-flex min-h-11 items-center rounded-xl border border-[var(--brd-line)] px-4 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)]"
            >
              {ts("rankingLink")}
            </Link>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-[var(--brd-mute)]">
              {source === "brd" ? t("samplesEmptyBrd") : t("samplesEmptyUser")}
            </p>
          ) : (
            <SampleCatalog key={source} paging={{ initialPage: parseCatalogPage(params.strona), query: source === "user" ? "zrodlo=user" : "" }} items={items} signedIn={Boolean(session)} isAdmin={isAdmin} instruments={instruments} types={types} linkTitles />
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}
